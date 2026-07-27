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

  it('backs off after a failed refresh while a stale value remains valid', async () => {
    const cache = new TtlCache<number>(1_000, 10_000, 2_000);
    await expect(cache.get('meta', async () => 7)).resolves.toBe(7);
    vi.advanceTimersByTime(1_001);

    const failedLoader = vi.fn(async () => {
      throw new Error('upstream unavailable');
    });
    await expect(cache.get('meta', failedLoader)).resolves.toBe(7);
    await expect(cache.get('meta', failedLoader)).resolves.toBe(7);

    expect(failedLoader).toHaveBeenCalledOnce();
  });

  it('does not return a stale value that expired while refresh was running', async () => {
    const startedAt = new Date('2026-07-27T00:00:00.000Z');
    const cache = new TtlCache<number>(1_000, 10_000, 2_000);
    await cache.get('meta', async () => 7);
    vi.advanceTimersByTime(1_001);

    await expect(cache.get('meta', async () => {
      vi.setSystemTime(new Date(startedAt.getTime() + 10_001));
      throw new Error('upstream unavailable');
    })).rejects.toThrow('upstream unavailable');
  });
});
