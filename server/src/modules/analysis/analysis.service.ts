import { and, desc, eq, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { analyses, idempotencyRecords, quotaEvents } from '../../db/schema.js';
import { AppError, ConflictError, NotFoundError } from '../../lib/errors.js';
import type { OpenDotaAdapter } from '../heroes/opendota.adapter.js';
import type { QuotaService, QuotaView } from '../quota/quota.service.js';
import { RecommendationEngine } from '../recommendation/recommendation.engine.js';
import {
  draftSchema,
  recommendationResultSchema,
} from '../recommendation/recommendation.schemas.js';
import type {
  DraftInput,
  RecommendationResult,
} from '../recommendation/recommendation.types.js';

const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });
type DraftView = z.output<typeof draftSchema>;

type AnalysisView = {
  id: string;
  status: 'completed';
  source: 'manual' | 'photo';
  input: DraftView;
  result: RecommendationResult;
  createdAt: string;
};

export type AnalysisExecution = {
  idempotencyRecordId: string;
  leaseToken: string;
  resourceId: string | null;
};

export class AnalysisConsistencyError extends AggregateError {
  public constructor(errors: Error[], cause: unknown) {
    super(errors, 'Analysis failed and consistency recovery was incomplete', {
      cause,
    });
    this.name = 'AnalysisConsistencyError';
  }
}

export class AnalysisService {
  public constructor(
    private readonly db: Database,
    private readonly meta: OpenDotaAdapter,
    private readonly quota: QuotaService,
    private readonly recommendations = new RecommendationEngine()
  ) {}

  public async analyze(
    accountId: string,
    draft: DraftInput,
    execution: AnalysisExecution
  ): Promise<{ analysis: AnalysisView; quota: QuotaView }> {
    const linked = execution.resourceId
      ? await this.findLinkedAnalysis(accountId, execution.resourceId)
      : undefined;
    if (linked?.status === 'completed') {
      try {
        return {
          analysis: this.toView(linked),
          quota: await this.quota.get(accountId),
        };
      } catch (error) {
        throw new AnalysisConsistencyError([this.toError(error)], error);
      }
    }

    if (linked?.status === 'failed') {
      try {
        await this.quota.refund(accountId, linked.id);
      } catch (error) {
        throw new AnalysisConsistencyError([this.toError(error)], error);
      }
    }

    const linkedWasRefunded =
      linked?.status === 'processing'
        ? await this.hasQuotaEvent(linked.id, 'refund')
        : false;
    const abandonedResourceId =
      linked?.status === 'processing' && linkedWasRefunded
        ? linked.id
        : undefined;
    const row =
      linked?.status === 'processing' && !linkedWasRefunded
        ? linked
        : await this.createLinkedAnalysis(
            accountId,
            draft,
            execution,
            abandonedResourceId
          );

    try {
      const heroes = await this.meta.getHeroes(draft.rank);
      const heroIds = new Set(heroes.map(hero => hero.id));
      const unknownIds = [
        ...draft.allyHeroIds,
        ...draft.enemyHeroIds,
        ...(draft.bannedHeroIds ?? []),
      ].filter(id => !heroIds.has(id));
      if (unknownIds.length > 0) {
        throw new AppError(
          422,
          'HERO_NOT_FOUND',
          'One or more selected heroes do not exist',
          { heroIds: unknownIds }
        );
      }

      const quota = await this.quota.reserve(accountId, row.id);
      const snapshot = await this.meta.getSnapshot(
        draft.rank,
        draft.enemyHeroIds,
        draft.allyHeroIds,
        heroes
      );
      const result = await this.recommendations.recommend({ draft, snapshot });
      if (result.recommendations.length !== 3) {
        throw new AppError(
          422,
          'INVALID_DRAFT',
          'Not enough valid recommendations for this draft'
        );
      }

      const completedAt = new Date();
      const completed = await this.completeOwnedAnalysis(
        execution,
        row.id,
        result,
        completedAt
      );
      if (!completed) {
        throw new ConflictError(
          'REQUEST_IN_PROGRESS',
          'The request lease is no longer active'
        );
      }

      return {
        analysis: {
          id: row.id,
          status: 'completed',
          source: draft.source,
          input: draftSchema.parse(draft),
          result,
          createdAt: row.createdAt.toISOString(),
        },
        quota,
      };
    } catch (error) {
      let failed;
      try {
        failed = await this.failOwnedAnalysis(
          execution,
          row.id,
          error instanceof AppError ? error.code : 'INTERNAL_ERROR'
        );
      } catch (compensationError) {
        throw new AnalysisConsistencyError(
          [this.toError(compensationError)],
          error
        );
      }
      if (!failed) throw error;
      try {
        await this.quota.refund(accountId, row.id);
      } catch (compensationError) {
        throw new AnalysisConsistencyError(
          [this.toError(compensationError)],
          error
        );
      }
      throw error;
    }
  }

  public async history(accountId: string, limit: number, cursor?: string) {
    const parsedCursor = cursor ? this.decodeCursor(cursor) : undefined;
    const cursorCondition = parsedCursor
      ? or(
          lt(analyses.createdAt, new Date(parsedCursor.createdAt)),
          and(
            eq(analyses.createdAt, new Date(parsedCursor.createdAt)),
            lt(analyses.id, parsedCursor.id)
          )
        )
      : undefined;
    const where = cursorCondition
      ? and(
          eq(analyses.accountId, accountId),
          eq(analyses.status, 'completed'),
          cursorCondition
        )
      : and(
          eq(analyses.accountId, accountId),
          eq(analyses.status, 'completed')
        );
    const rows = await this.db
      .select()
      .from(analyses)
      .where(where)
      .orderBy(desc(analyses.createdAt), desc(analyses.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).map(row => this.toView(row));
    const last = page.at(-1);
    return {
      items: page.map(item => ({
        id: item.id,
        source: item.source,
        input: item.input,
        result: item.result,
        createdAt: item.createdAt,
      })),
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({ createdAt: last.createdAt, id: last.id })
            ).toString('base64url')
          : null,
    };
  }

  public async get(accountId: string, id: string): Promise<AnalysisView> {
    const [row] = await this.db
      .select()
      .from(analyses)
      .where(
        and(
          eq(analyses.id, id),
          eq(analyses.accountId, accountId),
          eq(analyses.status, 'completed')
        )
      )
      .limit(1);
    if (!row) {
      throw new NotFoundError('Analysis not found');
    }
    return this.toView(row);
  }

  private toView(row: typeof analyses.$inferSelect): AnalysisView {
    return {
      id: row.id,
      status: 'completed',
      source: row.source,
      input: draftSchema.parse(row.input),
      result: recommendationResultSchema.parse(row.result),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async findLinkedAnalysis(accountId: string, resourceId: string) {
    const [row] = await this.db
      .select()
      .from(analyses)
      .where(
        and(eq(analyses.id, resourceId), eq(analyses.accountId, accountId))
      )
      .limit(1);
    return row;
  }

  private async createLinkedAnalysis(
    accountId: string,
    draft: DraftInput,
    execution: AnalysisExecution,
    abandonedResourceId?: string
  ) {
    return this.db.transaction(async tx => {
      const now = new Date();
      if (abandonedResourceId) {
        await tx
          .update(analyses)
          .set({
            status: 'failed',
            errorCode: 'INTERNAL_ERROR',
            updatedAt: now,
          })
          .where(
            and(
              eq(analyses.id, abandonedResourceId),
              eq(analyses.accountId, accountId),
              eq(analyses.status, 'processing')
            )
          );
      }
      const [row] = await tx
        .insert(analyses)
        .values({
          accountId,
          source: draft.source,
          input: {
            ...draft,
            bannedHeroIds: draft.bannedHeroIds ?? [],
          },
        })
        .returning();
      if (!row) {
        throw new Error('Failed to create analysis');
      }
      const [linked] = await tx
        .update(idempotencyRecords)
        .set({ resourceId: row.id, updatedAt: now })
        .where(
          and(
            eq(idempotencyRecords.id, execution.idempotencyRecordId),
            eq(idempotencyRecords.accountId, accountId),
            eq(idempotencyRecords.leaseToken, execution.leaseToken),
            eq(idempotencyRecords.status, 'in_progress')
          )
        )
        .returning({ id: idempotencyRecords.id });
      if (!linked) {
        throw new ConflictError(
          'REQUEST_IN_PROGRESS',
          'The request lease is no longer active'
        );
      }
      return row;
    });
  }

  private async hasQuotaEvent(
    analysisId: string,
    reason: 'analysis' | 'refund'
  ) {
    const [event] = await this.db
      .select({ id: quotaEvents.id })
      .from(quotaEvents)
      .where(
        and(
          eq(quotaEvents.analysisId, analysisId),
          eq(quotaEvents.reason, reason)
        )
      )
      .limit(1);
    return Boolean(event);
  }

  private async completeOwnedAnalysis(
    execution: AnalysisExecution,
    analysisId: string,
    result: RecommendationResult,
    completedAt: Date
  ) {
    return this.db.transaction(async tx => {
      const [lease] = await tx
        .select({ id: idempotencyRecords.id })
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.id, execution.idempotencyRecordId),
            eq(idempotencyRecords.leaseToken, execution.leaseToken),
            eq(idempotencyRecords.status, 'in_progress')
          )
        )
        .for('update');
      if (!lease) return false;
      const [completed] = await tx
        .update(analyses)
        .set({
          status: 'completed',
          result: { ...result },
          patch: result.patch,
          updatedAt: completedAt,
        })
        .where(
          and(eq(analyses.id, analysisId), eq(analyses.status, 'processing'))
        )
        .returning({ id: analyses.id });
      return Boolean(completed);
    });
  }

  private async failOwnedAnalysis(
    execution: AnalysisExecution,
    analysisId: string,
    errorCode: string
  ) {
    return this.db.transaction(async tx => {
      const [lease] = await tx
        .select({ id: idempotencyRecords.id })
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.id, execution.idempotencyRecordId),
            eq(idempotencyRecords.leaseToken, execution.leaseToken),
            eq(idempotencyRecords.status, 'in_progress')
          )
        )
        .for('update');
      if (!lease) return false;
      const [failed] = await tx
        .update(analyses)
        .set({ status: 'failed', errorCode, updatedAt: new Date() })
        .where(
          and(eq(analyses.id, analysisId), eq(analyses.status, 'processing'))
        )
        .returning({ id: analyses.id });
      return Boolean(failed);
    });
  }

  private toError(error: unknown) {
    return error instanceof Error ? error : new Error(String(error));
  }

  private decodeCursor(cursor: string) {
    try {
      return cursorSchema.parse(
        JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
      );
    } catch {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid history cursor');
    }
  }
}
