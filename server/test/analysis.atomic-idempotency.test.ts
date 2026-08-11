import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db/client.js';
import { AnalysisService, type AnalysisExecution } from '../src/modules/analysis/analysis.service.js';
import type { OpenDotaAdapter } from '../src/modules/heroes/opendota.adapter.js';
import type { QuotaService } from '../src/modules/quota/quota.service.js';
import type { RecommendationResult } from '../src/modules/recommendation/recommendation.types.js';

const execution: AnalysisExecution = {
  idempotencyRecordId: '00000000-0000-4000-8000-000000000001',
  leaseToken: 'lease-token',
  resourceId: '00000000-0000-4000-8000-000000000002',
};
const analysisId = '00000000-0000-4000-8000-000000000002';
const result = { patch: '7.41' } as RecommendationResult;
const response = {
  analysis: { id: analysisId, status: 'completed' },
  quota: { plan: 'free', remaining: 2 },
};

type AtomicCompletion = (
  execution: AnalysisExecution,
  analysisId: string,
  result: RecommendationResult,
  completedAt: Date,
  response: Record<string, unknown>,
  additionalExecutions: readonly AnalysisExecution[],
) => Promise<boolean>;

function completeOwnedAnalysis(service: AnalysisService): AtomicCompletion {
  const completion = (service as unknown as { completeOwnedAnalysis: AtomicCompletion })
    .completeOwnedAnalysis
    .bind(service);
  return completion;
}

function selectLease() {
  return {
    from: () => ({
      where: () => ({
        for: async () => [{ id: execution.idempotencyRecordId }],
      }),
    }),
  };
}

describe('AnalysisService atomic idempotency completion', () => {
  it('writes terminal analysis and replay response in one transaction', async () => {
    const writes: Record<string, unknown>[] = [];
    const tx = {
      select: vi.fn(selectLease),
      update: vi.fn(() => ({
        set: (values: Record<string, unknown>) => {
          writes.push(values);
          return {
            where: () => ({
              returning: async () => [{ id: analysisId }],
            }),
          };
        },
      })),
    };
    const transaction = vi.fn(async (operation: (current: typeof tx) => Promise<boolean>) => operation(tx));
    const service = new AnalysisService(
      { transaction } as unknown as Database,
      {} as OpenDotaAdapter,
      {} as QuotaService,
    );

    await expect(completeOwnedAnalysis(service)(
      execution,
      analysisId,
      result,
      new Date('2026-08-10T12:00:00.000Z'),
      response,
      [],
    )).resolves.toBe(true);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([
      expect.objectContaining({ status: 'completed', patch: '7.41' }),
      expect.objectContaining({
        resourceId: analysisId,
        status: 'completed',
        response,
      }),
    ]);
  });

  it('does not commit the transaction when the replay record cannot be completed', async () => {
    const writes: Record<string, unknown>[] = [];
    let committed = false;
    const tx = {
      select: vi.fn(selectLease),
      update: vi.fn(() => ({
        set: (values: Record<string, unknown>) => {
          writes.push(values);
          return {
            where: () => ({
              returning: async () => writes.length === 1 ? [{ id: analysisId }] : [],
            }),
          };
        },
      })),
    };
    const transaction = vi.fn(async (operation: (current: typeof tx) => Promise<boolean>) => {
      const value = await operation(tx);
      committed = true;
      return value;
    });
    const service = new AnalysisService(
      { transaction } as unknown as Database,
      {} as OpenDotaAdapter,
      {} as QuotaService,
    );

    await expect(completeOwnedAnalysis(service)(
      execution,
      analysisId,
      result,
      new Date('2026-08-10T12:00:00.000Z'),
      response,
      [],
    )).rejects.toMatchObject({ code: 'REQUEST_IN_PROGRESS' });

    expect(committed).toBe(false);
    expect(writes).toHaveLength(2);
  });
});
