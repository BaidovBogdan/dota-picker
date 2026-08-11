import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db/client.js';
import { AnalysisService } from '../src/modules/analysis/analysis.service.js';
import { historyResponseSchema } from '../src/modules/analysis/analysis.schemas.js';
import type { OpenDotaAdapter } from '../src/modules/heroes/opendota.adapter.js';
import type { QuotaService } from '../src/modules/quota/quota.service.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const analysisId = '00000000-0000-4000-8000-000000000002';

function createHistoryService(row: {
  id: string;
  source: 'manual' | 'photo' | 'overwolf';
  input: unknown;
  result: unknown;
  createdAt: Date;
}) {
  const limit = vi.fn(async () => [row]);
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit }),
        }),
      }),
    }),
  } as unknown as Database;
  return {
    service: new AnalysisService(
      db,
      {} as OpenDotaAdapter,
      {} as QuotaService,
    ),
    limit,
  };
}

describe('AnalysisService history summary', () => {
  it('keeps a legacy nullable draft input and an empty legacy result compact', async () => {
    const { service, limit } = createHistoryService({
      id: analysisId,
      source: 'manual',
      input: {
        position: null,
        rank: null,
        enemyHeroIds: [5, 14],
      },
      result: {
        patch: null,
        recommendations: [],
      },
      createdAt: new Date('2026-08-10T00:00:00.000Z'),
    });

    const response = await service.history(accountId, 20, undefined, 'summary');

    expect(limit).toHaveBeenCalledWith(21);
    expect(response).toMatchObject({
      view: 'summary',
      items: [{
        id: analysisId,
        input: {
          position: null,
          rank: null,
          enemyHeroIds: [5, 14],
        },
        result: {
          patch: null,
          recommendations: [],
        },
      }],
    });
    expect(historyResponseSchema.parse(response)).toEqual(response);
  });
});
