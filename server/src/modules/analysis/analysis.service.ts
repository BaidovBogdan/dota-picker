import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { analyses, analysisReviews, idempotencyRecords, quotaEvents } from '../../db/schema.js';
import { stableStringify } from '../../lib/crypto.js';
import { AppError, ConflictError, NotFoundError } from '../../lib/errors.js';
import type { OpenDotaAdapter } from '../heroes/opendota.adapter.js';
import type { MetaSnapshot } from '../heroes/heroes.types.js';
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
const historySummaryInputSchema = z.object({
  position: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]).nullable(),
  rank: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
  ]).nullable().optional(),
  enemyHeroIds: z.array(z.number().int().positive()).max(5),
});
const historySummaryResultSchema = z.object({
  patch: z.string().min(1).nullable(),
  recommendations: z.array(z.object({
    hero: z.object({
      id: z.number().int().positive(),
      name: z.string().min(1),
      localizedName: z.string().nullable(),
      imageUrl: z.url().nullable(),
      iconUrl: z.url().nullable(),
      roles: z.array(z.string()),
    }),
    score: z.number(),
    confidence: z.enum(['low', 'medium', 'high']),
  })).max(3),
});
type DraftView = z.output<typeof draftSchema>;

function canonicalDraft(draft: DraftView) {
  return {
    ...draft,
    allyHeroIds: [...draft.allyHeroIds].sort((left, right) => left - right),
    enemyHeroIds: [...draft.enemyHeroIds].sort((left, right) => left - right),
    bannedHeroIds: [...draft.bannedHeroIds].sort((left, right) => left - right),
  };
}

type AnalysisView = {
  id: string;
  status: 'completed';
  source: 'manual' | 'photo' | 'overwolf';
  input: DraftView;
  result: RecommendationResult;
  createdAt: string;
};

type AnalysisResponse = {
  analysis: AnalysisView;
  quota: QuotaView;
};

type RevisionResponse = AnalysisResponse & {
  revision: number;
  changed: boolean;
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

  public async analyze<TResponse extends Record<string, unknown> = AnalysisResponse>(
    accountId: string,
    draft: DraftInput,
    execution: AnalysisExecution,
    buildResponse: (response: AnalysisResponse) => TResponse = (response) => response as unknown as TResponse,
    additionalExecutions: readonly AnalysisExecution[] = [],
  ): Promise<TResponse> {
    const linked = execution.resourceId
      ? await this.findLinkedAnalysis(accountId, execution.resourceId)
      : undefined;
    if (linked?.status === 'completed') {
      try {
        const response = buildResponse({
          analysis: this.toView(linked),
          quota: await this.quota.get(accountId),
        });
        await this.completeOwnedIdempotency(execution, response, additionalExecutions);
        return response;
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
    const reusableProcessingAnalysis = linked?.status === 'processing' && !linkedWasRefunded
      ? linked
      : null;
    const preparedSnapshot = reusableProcessingAnalysis
      ? undefined
      : await this.requireReadySnapshot(draft);
    const row = reusableProcessingAnalysis ?? await this.createLinkedAnalysis(
      accountId,
      draft,
      execution,
      abandonedResourceId
    );

    try {
      const { quota, result } = await this.calculate(
        accountId,
        row.id,
        draft,
        true,
        preparedSnapshot,
      );

      const completedAt = new Date();
      const analysisResponse: AnalysisResponse = {
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
      const response = buildResponse(analysisResponse);
      const completed = await this.completeOwnedAnalysis(
        execution,
        row.id,
        result,
        completedAt,
        response,
        additionalExecutions,
      );
      if (!completed) {
        throw new ConflictError(
          'REQUEST_IN_PROGRESS',
          'The request lease is no longer active'
        );
      }

      return response;
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

  public async reviseOverwolf<TResponse extends Record<string, unknown> = Omit<RevisionResponse, 'changed'>>(
    accountId: string,
    analysisId: string,
    expectedRevision: number,
    draft: DraftInput,
    execution: AnalysisExecution,
    buildResponse: (response: Omit<RevisionResponse, 'changed'>) => TResponse = (response) => response as unknown as TResponse,
  ): Promise<TResponse> {
    const parsedDraft = draftSchema.parse(draft);
    const row = await this.findLinkedAnalysis(accountId, analysisId);
    if (row?.source !== 'overwolf' || row.status !== 'completed') {
      throw new NotFoundError('Analysis not found');
    }
    if (parsedDraft.source !== 'overwolf') {
      throw new AppError(
        422,
        'INVALID_DRAFT',
        'An Overwolf analysis revision must use the Overwolf source'
      );
    }
    if (
      row.revision === expectedRevision + 1
      && execution.resourceId === analysisId
    ) {
      const response = buildResponse({
        analysis: this.toView(row),
        quota: await this.quota.get(accountId),
        revision: row.revision,
      });
      await this.completeOwnedIdempotency(execution, response);
      return response;
    }
    if (row.revision !== expectedRevision) {
      throw new ConflictError(
        'REQUEST_IN_PROGRESS',
        'The live analysis capability is no longer current'
      );
    }

    const { quota, result } = await this.calculate(
      accountId,
      analysisId,
      parsedDraft,
      false,
    );
    const revisedAt = new Date();
    const revisionResponse = {
      analysis: {
        id: analysisId,
        status: 'completed' as const,
        source: 'overwolf' as const,
        input: parsedDraft,
        result,
        createdAt: row.createdAt.toISOString(),
      },
      quota,
      revision: expectedRevision + 1,
    };
    const response = buildResponse(revisionResponse);
    const revised = await this.completeOwnedRevision(
      accountId,
      analysisId,
      row.updatedAt,
      expectedRevision,
      parsedDraft,
      result,
      revisedAt,
      execution,
      'overwolf',
      response,
    );
    if (!revised) {
      throw new ConflictError(
        'REQUEST_IN_PROGRESS',
        'The analysis changed while this revision was being calculated'
      );
    }

    return response;
  }

  public async reviseDesktop<TResponse extends Record<string, unknown> = RevisionResponse>(
    accountId: string,
    analysisId: string,
    expectedRevision: number,
    draft: DraftInput | null,
    execution: AnalysisExecution,
    maximumRevisions: number,
    buildResponse: (response: RevisionResponse) => TResponse = (response) => response as unknown as TResponse,
  ): Promise<TResponse> {
    const parsedDraft = draft === null ? null : draftSchema.parse(draft);
    const row = await this.findLinkedAnalysis(accountId, analysisId);
    if (row?.source !== 'photo' || row.status !== 'completed') {
      throw new NotFoundError('Analysis not found');
    }
    if (parsedDraft !== null && parsedDraft.source !== 'photo') {
      throw new AppError(
        422,
        'INVALID_DRAFT',
        'A desktop analysis revision must preserve the photo source',
      );
    }
    if (
      row.revision === expectedRevision + 1
      && execution.resourceId === analysisId
    ) {
      const response = buildResponse({
        analysis: this.toView(row),
        quota: await this.quota.get(accountId),
        revision: row.revision,
        changed: true,
      });
      await this.completeOwnedIdempotency(execution, response);
      return response;
    }
    if (row.revision !== expectedRevision) {
      throw new ConflictError(
        'REQUEST_IN_PROGRESS',
        'The live analysis capability is no longer current',
      );
    }
    if (
      parsedDraft === null
      || stableStringify(canonicalDraft(parsedDraft))
        === stableStringify(canonicalDraft(draftSchema.parse(row.input)))
    ) {
      const response = buildResponse({
        analysis: this.toView(row),
        quota: await this.quota.get(accountId),
        revision: row.revision,
        changed: false,
      });
      await this.completeOwnedIdempotency(execution, response);
      return response;
    }
    if (expectedRevision >= maximumRevisions) {
      throw new AppError(
        429,
        'RATE_LIMITED',
        'Desktop live revision limit reached',
        { limit: maximumRevisions },
      );
    }

    const { quota, result } = await this.calculate(
      accountId,
      analysisId,
      parsedDraft,
      false,
    );
    const revisedAt = new Date();
    const revisionResponse: RevisionResponse = {
      analysis: {
        id: analysisId,
        status: 'completed',
        source: 'photo',
        input: parsedDraft,
        result,
        createdAt: row.createdAt.toISOString(),
      },
      quota,
      revision: expectedRevision + 1,
      changed: true,
    };
    const response = buildResponse(revisionResponse);
    const revised = await this.completeOwnedRevision(
      accountId,
      analysisId,
      row.updatedAt,
      expectedRevision,
      parsedDraft,
      result,
      revisedAt,
      execution,
      'photo',
      response,
    );
    if (!revised) {
      throw new ConflictError(
        'REQUEST_IN_PROGRESS',
        'The analysis changed while this revision was being calculated',
      );
    }

    return response;
  }

  public async history(
    accountId: string,
    limit: number,
    cursor?: string,
    view: 'full' | 'summary' = 'full',
  ) {
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
    if (view === 'summary') {
      const rows = await this.db
        .select({
          id: analyses.id,
          source: analyses.source,
          input: sql<unknown>`jsonb_build_object(
            'position', ${analyses.input} -> 'position',
            'rank', ${analyses.input} -> 'rank',
            'enemyHeroIds', coalesce(${analyses.input} -> 'enemyHeroIds', '[]'::jsonb)
          )`,
          result: sql<unknown>`case
            when ${analyses.result} is null then null
            else jsonb_build_object(
              'patch', ${analyses.result} -> 'patch',
              'recommendations', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'hero', jsonb_build_object(
                      'id', compact.item -> 'hero' -> 'id',
                      'name', compact.item -> 'hero' -> 'name',
                      'localizedName', compact.item -> 'hero' -> 'localizedName',
                      'imageUrl', compact.item -> 'hero' -> 'imageUrl',
                      'iconUrl', compact.item -> 'hero' -> 'iconUrl',
                      'roles', coalesce(compact.item -> 'hero' -> 'roles', '[]'::jsonb)
                    ),
                    'score', compact.item -> 'score',
                    'confidence', compact.item -> 'confidence'
                  ) order by compact.ordinality
                )
                from (
                  select recommendation.item, recommendation.ordinality
                  from jsonb_array_elements(
                    case
                      when jsonb_typeof(${analyses.result} -> 'recommendations') = 'array'
                        then ${analyses.result} -> 'recommendations'
                      else '[]'::jsonb
                    end
                  ) with ordinality as recommendation(item, ordinality)
                  order by recommendation.ordinality
                  limit 3
                ) as compact
              ), '[]'::jsonb)
            )
          end`,
          createdAt: analyses.createdAt,
        })
        .from(analyses)
        .where(where)
        .orderBy(desc(analyses.createdAt), desc(analyses.id))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        view,
        items: page.map((item) => {
          const input = historySummaryInputSchema.safeParse(item.input);
          const result = historySummaryResultSchema.safeParse(item.result);
          return {
            id: item.id,
            source: item.source,
            input: input.success ? input.data : null,
            result: result.success ? result.data : null,
            createdAt: item.createdAt.toISOString(),
          };
        }),
        nextCursor: hasMore && last
          ? Buffer.from(
            JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }),
          ).toString('base64url')
          : null,
      };
    }
    const rows = await this.db
      .select()
      .from(analyses)
      .where(where)
      .orderBy(desc(analyses.createdAt), desc(analyses.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const fullPage = rows.slice(0, limit).map(row => this.toView(row));
    const last = fullPage.at(-1);
    return {
      view,
      items: fullPage.map(item => ({
        id: item.id,
        source: item.source,
        input: item.input,
        result: item.result,
        createdAt: item.createdAt,
      })),
      nextCursor: hasMore && last
        ? Buffer.from(
          JSON.stringify({ createdAt: last.createdAt, id: last.id }),
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

  private async calculate(
    accountId: string,
    analysisId: string,
    draft: DraftInput,
    reserveQuota = true,
    preparedSnapshot?: MetaSnapshot,
  ): Promise<{ quota: QuotaView; result: RecommendationResult }> {
    const snapshot = preparedSnapshot ?? await this.requireReadySnapshot(draft);
    const quota = reserveQuota
      ? await this.quota.reserve(accountId, analysisId)
      : await this.quota.get(accountId);
    const result = await this.recommendations.recommend({ draft, snapshot });
    if (result.recommendations.length !== 3) {
      throw new AppError(
        422,
        'INVALID_DRAFT',
        'Not enough valid recommendations for this draft'
      );
    }
    return { quota, result };
  }

  private async requireReadySnapshot(draft: DraftInput): Promise<MetaSnapshot> {
    const snapshot = await this.meta.getSnapshot(
      draft.rank,
      draft.enemyHeroIds,
      draft.allyHeroIds,
    );
    const pairAvailability = snapshot.pairScope?.availability;
    const positionAvailability = snapshot.positionMeta?.availability;
    if (
      (pairAvailability !== undefined && pairAvailability !== 'ready')
      || (positionAvailability !== undefined && positionAvailability !== 'ready')
    ) {
      const resolvedPairAvailability = pairAvailability ?? 'unavailable';
      const resolvedPositionAvailability = positionAvailability ?? 'unavailable';
      const dataUnavailable = resolvedPairAvailability === 'unavailable'
        || snapshot.dataHealth?.availability === 'unavailable';
      throw new AppError(
        503,
        dataUnavailable ? 'EXTERNAL_SERVICE_UNAVAILABLE' : 'DRAFT_DATA_COLLECTING',
        dataUnavailable
          ? 'Draft data snapshot is temporarily unavailable'
          : 'Draft data snapshot is collecting and no complete recommendation was persisted',
        {
          pairAvailability: resolvedPairAvailability,
          positionAvailability: resolvedPositionAvailability,
          dataHealth: snapshot.dataHealth ?? null,
          retryAfterSeconds: dataUnavailable ? 60 : 15,
          retryable: true,
        },
      );
    }
    const snapshotHeroes = Array.isArray(snapshot.heroes) ? snapshot.heroes : [];
    const heroes = snapshotHeroes.length > 0
      ? snapshotHeroes
      : await this.meta.getHeroes(draft.rank);
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
    return snapshot;
  }

  private async completeOwnedAnalysis(
    execution: AnalysisExecution,
    analysisId: string,
    result: RecommendationResult,
    completedAt: Date,
    response: Record<string, unknown>,
    additionalExecutions: readonly AnalysisExecution[],
  ) {
    return this.db.transaction(async tx => {
      const executions = [execution, ...additionalExecutions]
        .toSorted((left, right) => left.idempotencyRecordId.localeCompare(right.idempotencyRecordId));
      for (const currentExecution of executions) {
        const [lease] = await tx
          .select({ id: idempotencyRecords.id })
          .from(idempotencyRecords)
          .where(
            and(
              eq(idempotencyRecords.id, currentExecution.idempotencyRecordId),
              eq(idempotencyRecords.leaseToken, currentExecution.leaseToken),
              eq(idempotencyRecords.status, 'in_progress'),
            ),
          )
          .for('update');
        if (!lease) return false;
      }
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
      if (!completed) return false;
      for (const currentExecution of executions) {
        const [idempotency] = await tx
          .update(idempotencyRecords)
          .set({
            resourceId: analysisId,
            status: 'completed',
            response,
            updatedAt: completedAt,
          })
          .where(
            and(
              eq(idempotencyRecords.id, currentExecution.idempotencyRecordId),
              eq(idempotencyRecords.leaseToken, currentExecution.leaseToken),
              eq(idempotencyRecords.status, 'in_progress'),
            ),
          )
          .returning({ id: idempotencyRecords.id });
        if (!idempotency) {
          throw new ConflictError(
            'REQUEST_IN_PROGRESS',
            'The request lease is no longer active',
          );
        }
      }
      return true;
    });
  }

  private async completeOwnedRevision(
    accountId: string,
    analysisId: string,
    expectedUpdatedAt: Date,
    expectedRevision: number,
    draft: DraftView,
    result: RecommendationResult,
    revisedAt: Date,
    execution: AnalysisExecution,
    source: 'photo' | 'overwolf',
    response: Record<string, unknown>,
  ) {
    return this.db.transaction(async tx => {
      const [lease] = await tx
        .select({ id: idempotencyRecords.id })
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.id, execution.idempotencyRecordId),
            eq(idempotencyRecords.accountId, accountId),
            eq(idempotencyRecords.leaseToken, execution.leaseToken),
            eq(idempotencyRecords.status, 'in_progress')
          )
        )
        .for('update');
      if (!lease) return false;
      const [current] = await tx
        .select({ id: analyses.id })
        .from(analyses)
        .where(
          and(
            eq(analyses.id, analysisId),
            eq(analyses.accountId, accountId),
            eq(analyses.source, source),
            eq(analyses.status, 'completed'),
            eq(analyses.updatedAt, expectedUpdatedAt),
            eq(analyses.revision, expectedRevision)
          )
        )
        .for('update');
      if (!current) return false;
      const [review] = await tx
        .select({ id: analysisReviews.id })
        .from(analysisReviews)
        .where(eq(analysisReviews.analysisId, analysisId))
        .limit(1);
      if (review) {
        throw new ConflictError(
          'ANALYSIS_REVIEWED',
          'A reviewed analysis can no longer be revised'
        );
      }
      const [revised] = await tx
        .update(analyses)
        .set({
          input: { ...draft },
          result: { ...result },
          patch: result.patch,
          errorCode: null,
          revision: expectedRevision + 1,
          updatedAt: revisedAt,
        })
        .where(
          and(
            eq(analyses.id, analysisId),
            eq(analyses.accountId, accountId),
            eq(analyses.source, source),
            eq(analyses.status, 'completed'),
            eq(analyses.updatedAt, expectedUpdatedAt),
            eq(analyses.revision, expectedRevision)
          )
        )
        .returning({ id: analyses.id });
      if (!revised) return false;
      const [completed] = await tx
        .update(idempotencyRecords)
        .set({
          resourceId: analysisId,
          status: 'completed',
          response,
          updatedAt: revisedAt,
        })
        .where(
          and(
            eq(idempotencyRecords.id, execution.idempotencyRecordId),
            eq(idempotencyRecords.accountId, accountId),
            eq(idempotencyRecords.leaseToken, execution.leaseToken),
            eq(idempotencyRecords.status, 'in_progress')
          )
        )
        .returning({ id: idempotencyRecords.id });
      if (!completed) {
        throw new ConflictError(
          'REQUEST_IN_PROGRESS',
          'The request lease is no longer active'
        );
      }
      return true;
    });
  }

  private async completeOwnedIdempotency(
    execution: AnalysisExecution,
    response: Record<string, unknown>,
    additionalExecutions: readonly AnalysisExecution[] = [],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const executions = [execution, ...additionalExecutions]
        .toSorted((left, right) => left.idempotencyRecordId.localeCompare(right.idempotencyRecordId));
      for (const currentExecution of executions) {
        const [completed] = await tx
          .update(idempotencyRecords)
          .set({ status: 'completed', response, updatedAt: new Date() })
          .where(
            and(
              eq(idempotencyRecords.id, currentExecution.idempotencyRecordId),
              eq(idempotencyRecords.leaseToken, currentExecution.leaseToken),
              eq(idempotencyRecords.status, 'in_progress'),
            ),
          )
          .returning({ id: idempotencyRecords.id });
        if (!completed) {
          throw new ConflictError(
            'REQUEST_IN_PROGRESS',
            'The request lease is no longer active',
          );
        }
      }
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
