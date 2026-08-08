import { z } from 'zod';

import { apiRequest } from '@/services/api/client';
import type { AnalysisReview } from '@/types/domain';

const reviewSchema = z.object({
  id: z.string().min(1),
  analysisId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  selectedHeroIds: z.array(z.number().int().positive()),
  comment: z.string().nullable().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  analysis: z
    .object({
      source: z.enum(['manual', 'photo', 'overwolf']),
      patch: z.string(),
      recommendations: z.array(
        z.object({
          id: z.number().int().positive(),
          localizedName: z.string().min(1),
          imageUrl: z.string(),
          iconUrl: z.string().optional(),
        }),
      ),
    })
    .optional(),
});

const reviewResponseSchema = z.object({ review: reviewSchema });
const reviewsResponseSchema = z.union([
  z.object({ reviews: z.array(reviewSchema) }),
  z.object({
    items: z.array(reviewSchema),
    nextCursor: z.string().nullable().optional(),
    total: z.number().int().nonnegative().optional(),
  }),
]);

const mapReview = (review: z.infer<typeof reviewSchema>): AnalysisReview => {
  const { analysis, ...fields } = review;
  return {
    ...fields,
    comment: review.comment?.trim() || null,
    ...(analysis
      ? {
          analysis: {
            source: analysis.source,
            patch: analysis.patch,
            recommendations: analysis.recommendations.map((hero) => ({
              id: hero.id,
              slug: String(hero.id),
              name: hero.localizedName,
              attribute: 'universal',
              positions: [1, 2, 3, 4, 5],
              imageUrl: hero.imageUrl,
              ...(hero.iconUrl ? { iconUrl: hero.iconUrl } : {}),
            })),
          },
        }
      : {}),
  };
};

export type AccountReviewsPage = {
  items: AnalysisReview[];
  nextCursor: string | null;
  total: number;
};

export async function getAccountReviewsPage(input: {
  analysisId?: string;
  cursor?: string | null;
  limit?: number;
} = {}): Promise<AccountReviewsPage> {
  const searchParams = new URLSearchParams();
  if (input.analysisId) searchParams.set('analysisId', input.analysisId);
  if (input.cursor) searchParams.set('cursor', input.cursor);
  searchParams.set('limit', String(input.limit ?? 25));
  const payload = await apiRequest<z.infer<typeof reviewsResponseSchema>>(
    `/account/reviews?${searchParams.toString()}`,
    { schema: reviewsResponseSchema },
  );
  const reviews = 'reviews' in payload ? payload.reviews : payload.items;
  return {
    items: reviews.map(mapReview),
    nextCursor: 'nextCursor' in payload ? payload.nextCursor ?? null : null,
    total: 'total' in payload ? payload.total ?? reviews.length : reviews.length,
  };
}

export async function getAnalysisReview(analysisId: string): Promise<AnalysisReview | null> {
  const page = await getAccountReviewsPage({ analysisId, limit: 1 });
  return page.items[0] ?? null;
}

export async function upsertAnalysisReview(
  analysisId: string,
  input: {
    rating: number;
    selectedHeroIds: number[];
    comment?: string;
  },
): Promise<AnalysisReview> {
  const payload = await apiRequest<z.infer<typeof reviewResponseSchema>>(
    `/analyses/${encodeURIComponent(analysisId)}/review`,
    {
      method: 'POST',
      body: JSON.stringify(input),
      schema: reviewResponseSchema,
    },
  );
  return mapReview(payload.review);
}

export async function deleteAccountReview(reviewId: string): Promise<void> {
  await apiRequest(`/account/reviews/${encodeURIComponent(reviewId)}`, {
    method: 'DELETE',
  });
}
