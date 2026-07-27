import { describe, expect, it } from 'vitest';
import { upsertReviewSchema } from '../src/modules/reviews/review.schemas.js';
import { assertReviewHeroes } from '../src/modules/reviews/review.service.js';

describe('review contract', () => {
  it('normalizes a valid review', () => {
    expect(upsertReviewSchema.parse({
      rating: 5,
      selectedHeroIds: [14, 27],
      comment: '  Хороший результат  ',
    })).toEqual({
      rating: 5,
      selectedHeroIds: [14, 27],
      comment: 'Хороший результат',
    });
  });

  it('normalizes an empty comment to null', () => {
    expect(upsertReviewSchema.parse({
      rating: 4,
      selectedHeroIds: [],
      comment: '   ',
    }).comment).toBeNull();
  });

  it('rejects duplicate or excessive selected heroes', () => {
    expect(() => upsertReviewSchema.parse({
      rating: 3,
      selectedHeroIds: [1, 1],
    })).toThrow();
    expect(() => upsertReviewSchema.parse({
      rating: 3,
      selectedHeroIds: [1, 2, 3, 4],
    })).toThrow();
  });

  it('rejects invalid rating and oversized comment', () => {
    expect(() => upsertReviewSchema.parse({
      rating: 0,
      selectedHeroIds: [],
    })).toThrow();
    expect(() => upsertReviewSchema.parse({
      rating: 5,
      selectedHeroIds: [],
      comment: 'x'.repeat(501),
    })).toThrow();
  });

  it('accepts only heroes returned by the reviewed analysis', () => {
    expect(() => assertReviewHeroes([14, 26], [14, 26, 42])).not.toThrow();
    expect(() => assertReviewHeroes([14, 74], [14, 26, 42])).toThrow(
      expect.objectContaining({
        code: 'INVALID_REVIEW',
        statusCode: 422,
        details: { heroIds: [74] },
      }),
    );
  });
});
