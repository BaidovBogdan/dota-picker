import type { AnalysisResult } from '@/types/domain';

const canonicalId = (item: AnalysisResult) => item.serverId ?? item.id;

export const isSummaryHistoryRecord = (item: AnalysisResult | undefined) =>
  item?.source === 'server' && item.detailLevel === 'summary';

export const combineHistoryRecords = (
  incoming: AnalysisResult[],
  existing: AnalysisResult[],
  deletedHistoryIds: string[],
  limit: number,
) => {
  const deleted = new Set(deletedHistoryIds);
  const combined = new Map<string, AnalysisResult>();

  for (const item of [...incoming, ...existing]) {
    const id = canonicalId(item);
    if (deleted.has(id)) continue;
    const current = combined.get(id);
    if (!current || (isSummaryHistoryRecord(current) && !isSummaryHistoryRecord(item))) {
      combined.set(id, item);
    }
  }

  return [...combined.values()]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, limit);
};
