import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db/client.js';
import { ReviewService } from '../src/modules/reviews/review.service.js';

function queryResult<T>(value: T) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    for: vi.fn(async () => value),
    then: <TResult1 = T, TResult2 = never>(
      onFulfilled?: ((result: T) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?:
        ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => Promise.resolve(value).then(onFulfilled, onRejected),
  };
  return builder;
}

describe('admin review deletion audit', () => {
  it('records a non-PII audit snapshot in the same transaction as deletion', async () => {
    const review = {
      id: '0af9bc4c-1654-4cac-913c-b45f20bb9dc2',
      analysisId: '1cc9c882-a0b2-431a-bbab-79bd41327cc1',
      accountId: '799b366a-4ebf-4c51-b79d-e9d7fe61ff17',
      rating: 2,
    };
    const insertedValues = vi.fn(async () => undefined);
    const returning = vi.fn(async () => [{ id: review.id }]);
    const tx = {
      select: vi.fn(() => queryResult([review])),
      insert: vi.fn(() => ({ values: insertedValues })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({ returning })),
      })),
    };
    const db = {
      transaction: vi.fn(
        async (operation: (transaction: typeof tx) => unknown) => operation(tx)
      ),
    } as unknown as Database;

    await new ReviewService(db).deleteForAdmin(review.id, 'admin-session');

    expect(insertedValues).toHaveBeenCalledWith({
      action: 'delete_review',
      marker: `admin-delete-review:${review.id}`,
      actor: 'admin-session',
      details: {
        reviewId: review.id,
        analysisId: review.analysisId,
        accountId: review.accountId,
        rating: review.rating,
      },
    });
    expect(returning).toHaveBeenCalledOnce();
  });

  it('treats a retry of an already audited deletion as successful', async () => {
    const reviewId = '0af9bc4c-1654-4cac-913c-b45f20bb9dc2';
    const results = [[], [{ id: '30f46102-f2d9-4597-8e99-150fdfe74563' }]];
    const tx = {
      select: vi.fn(() => queryResult(results.shift() ?? [])),
      insert: vi.fn(),
      delete: vi.fn(),
    };
    const db = {
      transaction: vi.fn(
        async (operation: (transaction: typeof tx) => unknown) => operation(tx)
      ),
    } as unknown as Database;

    await expect(
      new ReviewService(db).deleteForAdmin(reviewId, 'legacy-admin-key')
    ).resolves.toBeUndefined();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });
});
