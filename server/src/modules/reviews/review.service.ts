import {
  and,
  avg,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { accounts, analyses, analysisReviews } from '../../db/schema.js';
import { AppError, NotFoundError } from '../../lib/errors.js';
import { recommendationResultSchema } from '../recommendation/recommendation.schemas.js';
import type {
  AccountReviewsQuery,
  AdminReviewsQuery,
  UpsertReviewInput,
} from './review.schemas.js';

type AnalysisData = Pick<typeof analyses.$inferSelect, 'source' | 'patch' | 'result'>;
type AccountReviewsCursor = {
  id: string;
  updatedAt: Date;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encodeAccountReviewsCursor(cursor: AccountReviewsCursor) {
  return Buffer.from(JSON.stringify({
    id: cursor.id,
    updatedAt: cursor.updatedAt.toISOString(),
  })).toString('base64url');
}

function decodeAccountReviewsCursor(value: string): AccountReviewsCursor {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      id?: unknown;
      updatedAt?: unknown;
    };
    if (
      typeof decoded.id !== 'string'
      || !uuidPattern.test(decoded.id)
      || typeof decoded.updatedAt !== 'string'
    ) {
      throw new Error('Invalid cursor');
    }
    const updatedAt = new Date(decoded.updatedAt);
    if (!Number.isFinite(updatedAt.getTime()) || updatedAt.toISOString() !== decoded.updatedAt) {
      throw new Error('Invalid cursor');
    }
    return { id: decoded.id, updatedAt };
  } catch {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid reviews cursor');
  }
}

export function assertReviewHeroes(selectedHeroIds: number[], recommendationHeroIds: number[]) {
  const recommendationIds = new Set(recommendationHeroIds);
  const invalidHeroIds = selectedHeroIds.filter((heroId) => !recommendationIds.has(heroId));
  if (invalidHeroIds.length > 0) {
    throw new AppError(422, 'INVALID_REVIEW', 'Selected heroes must belong to this analysis result', {
      heroIds: invalidHeroIds,
    });
  }
}

export class ReviewService {
  public constructor(private readonly db: Database) {}

  public async upsert(accountId: string, analysisId: string, input: UpsertReviewInput) {
    const [analysis] = await this.db
      .select({
        source: analyses.source,
        patch: analyses.patch,
        result: analyses.result,
      })
      .from(analyses)
      .where(and(
        eq(analyses.id, analysisId),
        eq(analyses.accountId, accountId),
        eq(analyses.status, 'completed'),
      ))
      .limit(1);
    if (!analysis) {
      throw new NotFoundError('Completed analysis not found');
    }

    const result = recommendationResultSchema.parse(analysis.result);
    assertReviewHeroes(
      input.selectedHeroIds,
      result.recommendations.map(({ hero }) => hero.id),
    );

    const now = new Date();
    const [review] = await this.db
      .insert(analysisReviews)
      .values({
        accountId,
        analysisId,
        rating: input.rating,
        selectedHeroIds: input.selectedHeroIds,
        comment: input.comment,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [analysisReviews.accountId, analysisReviews.analysisId],
        set: {
          rating: input.rating,
          selectedHeroIds: input.selectedHeroIds,
          comment: input.comment,
          updatedAt: now,
        },
      })
      .returning();
    if (!review) {
      throw new Error('Failed to save review');
    }
    return this.toView(review, analysis);
  }

  public async listForAccount(accountId: string, query: AccountReviewsQuery) {
    const cursor = query.cursor ? decodeAccountReviewsCursor(query.cursor) : null;
    const baseConditions: SQL[] = [
      eq(analysisReviews.accountId, accountId),
      eq(analyses.accountId, accountId),
      eq(analyses.status, 'completed'),
    ];
    if (query.analysisId) {
      baseConditions.push(eq(analysisReviews.analysisId, query.analysisId));
    }
    const pageConditions = [...baseConditions];
    if (cursor) {
      const cursorCondition = or(
        lt(analysisReviews.updatedAt, cursor.updatedAt),
        and(
          eq(analysisReviews.updatedAt, cursor.updatedAt),
          lt(analysisReviews.id, cursor.id),
        ),
      );
      if (cursorCondition) pageConditions.push(cursorCondition);
    }

    const [totalRows, rows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(analysisReviews)
        .innerJoin(analyses, eq(analyses.id, analysisReviews.analysisId))
        .where(and(...baseConditions)),
      this.db
        .select({
          review: analysisReviews,
          analysis: {
            source: analyses.source,
            patch: analyses.patch,
            result: analyses.result,
          },
        })
        .from(analysisReviews)
        .innerJoin(analyses, eq(analyses.id, analysisReviews.analysisId))
        .where(and(...pageConditions))
        .orderBy(desc(analysisReviews.updatedAt), desc(analysisReviews.id))
        .limit(query.limit + 1),
    ]);

    const hasNextPage = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const lastReview = page.at(-1)?.review;
    return {
      items: page.map(({ review, analysis }) => this.toView(review, analysis)),
      nextCursor: hasNextPage && lastReview
        ? encodeAccountReviewsCursor({
            id: lastReview.id,
            updatedAt: lastReview.updatedAt,
          })
        : null,
      total: totalRows[0]?.count ?? 0,
    };
  }

  public async deleteForAccount(accountId: string, reviewId: string) {
    const [deleted] = await this.db
      .delete(analysisReviews)
      .where(and(eq(analysisReviews.id, reviewId), eq(analysisReviews.accountId, accountId)))
      .returning({ id: analysisReviews.id });
    if (!deleted) {
      throw new NotFoundError('Review not found');
    }
  }

  public async listForAdmin(query: AdminReviewsQuery) {
    const conditions = this.adminConditions(query);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [aggregateRows, distributionRows, rows] = await Promise.all([
      this.db
        .select({
          count: count(),
          averageRating: avg(analysisReviews.rating),
        })
        .from(analysisReviews)
        .innerJoin(accounts, eq(accounts.id, analysisReviews.accountId))
        .innerJoin(analyses, eq(analyses.id, analysisReviews.analysisId))
        .where(where),
      this.db
        .select({
          rating: analysisReviews.rating,
          count: count(),
        })
        .from(analysisReviews)
        .innerJoin(accounts, eq(accounts.id, analysisReviews.accountId))
        .innerJoin(analyses, eq(analyses.id, analysisReviews.analysisId))
        .where(where)
        .groupBy(analysisReviews.rating),
      this.db
        .select({
          review: analysisReviews,
          account: {
            id: accounts.id,
            kind: accounts.kind,
            email: accounts.email,
          },
          analysis: {
            source: analyses.source,
            patch: analyses.patch,
            result: analyses.result,
          },
        })
        .from(analysisReviews)
        .innerJoin(accounts, eq(accounts.id, analysisReviews.accountId))
        .innerJoin(analyses, eq(analyses.id, analysisReviews.analysisId))
        .where(where)
        .orderBy(desc(analysisReviews.updatedAt), desc(analysisReviews.id))
        .limit(query.limit)
        .offset(query.offset),
    ]);

    const aggregate = aggregateRows[0];
    const total = aggregate?.count ?? 0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of distributionRows) {
      if (row.rating >= 1 && row.rating <= 5) {
        distribution[row.rating as keyof typeof distribution] = row.count;
      }
    }
    return {
      summary: {
        count: total,
        averageRating: aggregate?.averageRating === null || aggregate?.averageRating === undefined
          ? null
          : Number(aggregate.averageRating),
        distribution,
      },
      items: rows.map(({ review, analysis, account }) => ({
        ...this.toView(review, analysis),
        account,
      })),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total,
      },
    };
  }

  public async deleteForAdmin(reviewId: string) {
    const [deleted] = await this.db
      .delete(analysisReviews)
      .where(eq(analysisReviews.id, reviewId))
      .returning({ id: analysisReviews.id });
    if (!deleted) {
      throw new NotFoundError('Review not found');
    }
  }

  private adminConditions(query: AdminReviewsQuery) {
    const conditions: SQL[] = [];
    if (query.rating !== undefined) {
      conditions.push(eq(analysisReviews.rating, query.rating));
    }
    if (query.hasComment === 'true') {
      const condition = and(
        isNotNull(analysisReviews.comment),
        sql`char_length(trim(${analysisReviews.comment})) > 0`,
      );
      if (condition) conditions.push(condition);
    }
    if (query.hasComment === 'false') {
      const condition = or(
        isNull(analysisReviews.comment),
        sql`char_length(trim(${analysisReviews.comment})) = 0`,
      );
      if (condition) conditions.push(condition);
    }
    if (query.q) {
      const escapedQuery = query.q.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
      const pattern = `%${escapedQuery}%`;
      const condition = or(
        ilike(accounts.email, pattern),
        ilike(analysisReviews.comment, pattern),
        sql`${analysisReviews.id}::text ilike ${pattern}`,
        sql`${analysisReviews.analysisId}::text ilike ${pattern}`,
      );
      if (condition) conditions.push(condition);
    }
    return conditions;
  }

  private toView(review: typeof analysisReviews.$inferSelect, analysis: AnalysisData) {
    const result = recommendationResultSchema.parse(analysis.result);
    return {
      id: review.id,
      analysisId: review.analysisId,
      rating: review.rating,
      selectedHeroIds: review.selectedHeroIds,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      analysis: {
        source: analysis.source,
        patch: analysis.patch ?? result.patch,
        recommendations: result.recommendations.map(({ hero }) => ({
          id: hero.id,
          localizedName: hero.localizedName,
          imageUrl: hero.imageUrl,
          iconUrl: hero.iconUrl,
        })),
      },
    };
  }
}
