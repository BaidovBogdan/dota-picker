const collectingRefreshDelays = [2_000, 4_000, 8_000, 12_000] as const;

export function heroDetailRefreshInterval(
  availability: 'ready' | 'collecting' | 'unavailable' | undefined,
  isStale: boolean | undefined,
  completedFetchCount: number,
): number | false {
  if (availability !== 'collecting' && !isStale) return false;
  return collectingRefreshDelays[Math.max(0, completedFetchCount - 1)] ?? false;
}
