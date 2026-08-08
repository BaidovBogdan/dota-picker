const refreshDelays = [2_000, 4_000, 8_000, 12_000] as const;

type BuildAvailability = 'ready' | 'collecting' | 'unavailable' | undefined;

export function heroDetailNeedsRefresh(
  availability: BuildAvailability,
  isStale: boolean | undefined,
): boolean {
  return availability === 'collecting' || isStale === true;
}

export function heroDetailRefreshInterval(
  availability: BuildAvailability,
  isStale: boolean | undefined,
  completedFetchCount: number,
): number | false {
  if (!heroDetailNeedsRefresh(availability, isStale)) return false;
  return refreshDelays[Math.max(0, completedFetchCount - 1)] ?? false;
}
