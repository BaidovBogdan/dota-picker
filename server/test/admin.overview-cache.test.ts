import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import type { Database } from '../src/db/client.js';
import { AdminService } from '../src/modules/admin/admin.service.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://dota_picker:dota_picker@localhost:5432/dota_picker',
  JWT_SECRET: 'test-jwt-secret-that-is-longer-than-32-characters',
  REVENUECAT_WEBHOOK_SECRET: 'test-revenuecat-secret-long-enough',
  ADMIN_API_KEY: 'test-admin-key-that-is-longer-than-32-characters',
  ADMIN_OVERVIEW_CACHE_SECONDS: '10',
});

function emptyQuery() {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    groupBy: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    then: <TResult1 = unknown[], TResult2 = never>(
      onFulfilled?: ((result: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve([]).then(onFulfilled, onRejected),
  };
  return builder;
}

describe('AdminService overview cache', () => {
  it('single-flights concurrent reads and serves the same range from cache', async () => {
    const select = vi.fn(() => emptyQuery());
    const service = new AdminService({ select } as unknown as Database, config);

    await Promise.all(Array.from({ length: 20 }, () => service.overview({ days: 7 })));
    expect(select).toHaveBeenCalledTimes(8);

    await service.overview({ days: 7 });
    expect(select).toHaveBeenCalledTimes(8);

    await service.overview({ days: 30 });
    expect(select).toHaveBeenCalledTimes(16);
  });
});
