import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../src/modules/heroes/cache.js';

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves a stale value immediately while one refresh is in flight', async () => {
    const cache = new TtlCache<number>(1_000, 10_000, 2_000);
    await expect(cache.get('meta', async () => 7)).resolves.toBe(7);
    vi.advanceTimersByTime(1_001);

    let resolveRefresh: ((value: number) => void) | undefined;
    const refresh = new Promise<number>((resolve) => {
      resolveRefresh = resolve;
    });
    const refreshLoader = vi.fn(() => refresh);
    await expect(cache.get('meta', refreshLoader)).resolves.toBe(7);
    await expect(cache.get('meta', refreshLoader)).resolves.toBe(7);

    expect(refreshLoader).toHaveBeenCalledOnce();
    resolveRefresh?.(9);
    await Promise.resolve();
    await Promise.resolve();
    await expect(cache.get('meta', refreshLoader)).resolves.toBe(9);
  });

  it('backs off after a failed background refresh while stale data remains valid', async () => {
    const cache = new TtlCache<number>(1_000, 10_000, 2_000);
    await cache.get('meta', async () => 7);
    vi.advanceTimersByTime(1_001);

    const failedLoader = vi.fn(async () => {
      throw new Error('upstream unavailable');
    });
    await expect(cache.get('meta', failedLoader)).resolves.toBe(7);
    await Promise.resolve();
    await Promise.resolve();
    await expect(cache.get('meta', failedLoader)).resolves.toBe(7);
    expect(failedLoader).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(2_000);
    await expect(cache.get('meta', failedLoader)).resolves.toBe(7);
    expect(failedLoader).toHaveBeenCalledTimes(2);
  });

  it('waits for a loader once no stale value remains', async () => {
    const cache = new TtlCache<number>(1_000, 10_000, 2_000);
    await cache.get('meta', async () => 7);
    vi.advanceTimersByTime(10_001);

    await expect(cache.get('meta', async () => {
      throw new Error('upstream unavailable');
    })).rejects.toThrow('upstream unavailable');
  });
});
