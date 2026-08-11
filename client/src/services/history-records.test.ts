import { describe, expect, it } from 'vitest';

import type { AnalysisResult } from '@/types/domain';

import { combineHistoryRecords } from './history-records';

const record = (
  id: string,
  options: Pick<AnalysisResult, 'source' | 'detailLevel'>,
): AnalysisResult => ({
  id,
  draft: {
    allies: [],
    enemies: [1],
    position: 1,
    rank: null,
    source: 'manual',
    photoUri: null,
    updatedAt: '2026-08-10T10:00:00.000Z',
  },
  recommendations: [],
  patch: '7.41',
  confidence: 'low',
  dataUpdatedAt: '2026-08-10T10:00:00.000Z',
  createdAt: '2026-08-10T10:00:00.000Z',
  ...options,
});

describe('history record merging', () => {
  it('keeps hydrated server details through later compact refreshes without dropping local history', () => {
    const hydrated = record('server-analysis', { source: 'server' });
    const summary = record('server-analysis', { source: 'server', detailLevel: 'summary' });
    const offline = record('local-analysis', { source: 'offline' });

    const merged = combineHistoryRecords([summary], [hydrated, offline], [], 50);

    expect(merged).toContain(hydrated);
    expect(merged).not.toContain(summary);
    expect(merged).toContain(offline);
    expect(combineHistoryRecords([hydrated], [summary], [], 50)).toEqual([hydrated]);
  });
});
