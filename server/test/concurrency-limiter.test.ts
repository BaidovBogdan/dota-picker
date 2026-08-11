import { describe, expect, it } from 'vitest';
import { ConcurrencyLimiter } from '../src/lib/concurrency-limiter.js';

describe('ConcurrencyLimiter', () => {
  it('enforces the bound and releases capacity exactly once', () => {
    const limiter = new ConcurrencyLimiter(2);
    const first = limiter.tryAcquire();
    const second = limiter.tryAcquire();

    expect(first).toBeTypeOf('function');
    expect(second).toBeTypeOf('function');
    expect(limiter.tryAcquire()).toBeNull();
    expect(limiter.inFlight).toBe(2);

    first?.();
    first?.();
    expect(limiter.inFlight).toBe(1);

    const third = limiter.tryAcquire();
    expect(third).toBeTypeOf('function');
    expect(limiter.inFlight).toBe(2);

    second?.();
    third?.();
    expect(limiter.inFlight).toBe(0);
  });
});
