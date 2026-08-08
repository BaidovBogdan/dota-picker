import { describe, expect, it } from 'vitest';

import { heroDetailNeedsRefresh, heroDetailRefreshInterval } from './hero-detail-refresh';

describe('hero detail background refresh', () => {
  it('polls collecting and stale snapshots with bounded backoff', () => {
    expect(
      [1, 2, 3, 4, 5].map((count) => heroDetailRefreshInterval('collecting', false, count)),
    ).toEqual([2_000, 4_000, 8_000, 12_000, false]);
    expect(heroDetailRefreshInterval('ready', true, 1)).toBe(2_000);
  });

  it('counts failed fetches toward the same limit', () => {
    const successfulFetches = 1;
    expect(
      [0, 1, 2, 3, 4].map((failedFetches) => heroDetailRefreshInterval(
        'collecting',
        false,
        successfulFetches + failedFetches,
      )),
    ).toEqual([2_000, 4_000, 8_000, 12_000, false]);
  });

  it('refreshes incomplete snapshots on mount and stops for terminal fresh data', () => {
    expect(heroDetailNeedsRefresh('collecting', false)).toBe(true);
    expect(heroDetailNeedsRefresh('ready', true)).toBe(true);
    expect(heroDetailNeedsRefresh('ready', false)).toBe(false);
    expect(heroDetailNeedsRefresh('unavailable', false)).toBe(false);
  });
});
