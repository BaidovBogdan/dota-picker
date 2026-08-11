import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db/client.js';
import { IdempotencyService } from '../src/modules/idempotency/idempotency.service.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const recordId = '00000000-0000-4000-8000-000000000002';

describe('IdempotencyService', () => {
  it('claims a fresh key with one insert and no pre-emptive expiry delete', async () => {
    const returning = vi.fn(async () => [{ id: recordId, resourceId: null }]);
    const deleteRecord = vi.fn();
    const db = {
      insert: vi.fn(() => ({
        values: () => ({
          onConflictDoNothing: () => ({ returning }),
        }),
      })),
      delete: deleteRecord,
    } as unknown as Database;
    const service = new IdempotencyService(db, 24 * 60 * 60 * 1_000, 5 * 60 * 1_000);

    const claim = await service.claim(accountId, 'analyses.manual', 'request-key', { position: 1 });

    expect(claim).toMatchObject({ kind: 'acquired', id: recordId, resourceId: null });
    expect(returning).toHaveBeenCalledTimes(1);
    expect(deleteRecord).not.toHaveBeenCalled();
  });

  it('coalesces scheduled expiry cleanup while one batch is running', async () => {
    let resolveExecute: ((value: { rows: { deleted_count: number }[] }) => void) | undefined;
    const execute = vi.fn(() => new Promise<{ rows: { deleted_count: number }[] }>((resolve) => {
      resolveExecute = resolve;
    }));
    const service = new IdempotencyService(
      { execute } as unknown as Database,
      24 * 60 * 60 * 1_000,
      5 * 60 * 1_000,
    );

    const first = service.pruneExpired();
    const second = service.pruneExpired();
    expect(first).toBe(second);
    expect(execute).toHaveBeenCalledTimes(1);

    resolveExecute?.({ rows: [{ deleted_count: 12 }] });
    await expect(first).resolves.toBe(false);
  });
});
