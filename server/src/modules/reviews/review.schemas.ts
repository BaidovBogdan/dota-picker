import { z } from 'zod';

export const reviewCommentSchema = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .transform((value) => value === '' ? null : value ?? null);

export const selectedHeroIdsSchema = z
  .array(z.number().int().positive())
  .max(3)
  .default([])
  .refine((heroIds) => new Set(heroIds).size === heroIds.length, {
    message: 'Each selected hero can appear only once',
  });

export const upsertReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  selectedHeroIds: selectedHeroIdsSchema,
  comment: reviewCommentSchema,
});

export const reviewHeroSchema = z.object({
  id: z.number().int().positive(),
  localizedName: z.string(),
  imageUrl: z.url(),
  iconUrl: z.url(),
});

export const reviewSchema = z.object({
  id: z.uuid(),
  analysisId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  selectedHeroIds: selectedHeroIdsSchema,
  comment: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  analysis: z.object({
    source: z.enum(['manual', 'photo', 'overwolf']),
    patch: z.string(),
    recommendations: z.array(reviewHeroSchema).length(3),
  }),
});

export const reviewResponseSchema = z.object({ review: reviewSchema });

export const accountReviewsResponseSchema = z.object({
  items: z.array(reviewSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
});

export const accountReviewsQuerySchema = z.object({
  analysisId: z.uuid().optional(),
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export const adminReviewSchema = reviewSchema.extend({
  account: z.object({
    id: z.uuid(),
    kind: z.enum(['guest', 'user']),
    email: z.email().nullable(),
  }),
});

export const adminReviewsQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  hasComment: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const adminReviewsResponseSchema = z.object({
  summary: z.object({
    count: z.number().int().nonnegative(),
    averageRating: z.number().min(0).max(5).nullable(),
    distribution: z.object({
      1: z.number().int().nonnegative(),
      2: z.number().int().nonnegative(),
      3: z.number().int().nonnegative(),
      4: z.number().int().nonnegative(),
      5: z.number().int().nonnegative(),
    }),
  }),
  items: z.array(adminReviewSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export type UpsertReviewInput = z.infer<typeof upsertReviewSchema>;
export type AccountReviewsQuery = z.infer<typeof accountReviewsQuerySchema>;
export type AdminReviewsQuery = z.infer<typeof adminReviewsQuerySchema>;
