import { z } from 'zod';
import { rankBracketSchema } from '../heroes/heroes.schemas.js';
import { recognitionResponseSchema } from '../photo/photo.schemas.js';
import { quotaSchema } from '../quota/quota.schemas.js';
import { draftSchema, recommendationResultSchema } from '../recommendation/recommendation.schemas.js';

export const analysisSchema = z.object({
  id: z.uuid(),
  status: z.literal('completed'),
  source: z.enum(['manual', 'photo', 'overwolf']),
  input: draftSchema,
  result: recommendationResultSchema,
  createdAt: z.iso.datetime(),
});

export const analysisResponseSchema = z.object({
  analysis: analysisSchema,
  quota: quotaSchema,
});

export const liveAnalysisSessionSchema = z.object({
  token: z.string().min(32),
  revision: z.number().int().min(0).max(8),
  expiresAt: z.iso.datetime(),
});

export const overwolfAnalysisResponseSchema = analysisResponseSchema.extend({
  liveSession: liveAnalysisSessionSchema,
});

export const historyItemSchema = analysisSchema.pick({
  id: true,
  source: true,
  input: true,
  result: true,
  createdAt: true,
});

const historySummaryHeroSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  localizedName: z.string().nullable(),
  imageUrl: z.url().nullable(),
  iconUrl: z.url().nullable(),
  roles: z.array(z.string()),
});

const historySummaryRecommendationSchema = z.object({
  hero: historySummaryHeroSchema,
  score: z.number(),
  confidence: z.enum(['low', 'medium', 'high']),
});

export const historySummaryItemSchema = z.object({
  id: z.uuid(),
  source: z.enum(['manual', 'photo', 'overwolf']),
  input: z.object({
    position: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]).nullable(),
    rank: rankBracketSchema.nullable().optional(),
    enemyHeroIds: z.array(z.number().int().positive()).max(5),
  }).nullable(),
  result: z.object({
    patch: z.string().min(1).nullable(),
    recommendations: z.array(historySummaryRecommendationSchema).max(3),
  }).nullable(),
  createdAt: z.iso.datetime(),
});

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
  view: z.enum(['full', 'summary']).default('full'),
});

export const historyResponseSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('full'),
    items: z.array(historyItemSchema),
    nextCursor: z.string().nullable(),
  }),
  z.object({
    view: z.literal('summary'),
    items: z.array(historySummaryItemSchema),
    nextCursor: z.string().nullable(),
  }),
]);

export const historyDetailResponseSchema = z.object({ analysis: analysisSchema });

export const desktopAnalysisQuerySchema = z.object({
  sessionId: z.uuid(),
  position: z.coerce.number().pipe(
    z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
  ),
  autoPosition: z.enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
  allyGroup: z.enum(['left', 'right']).optional(),
  orientationSource: z.enum([
    'gsi_layout_heuristic',
    'gsi_player_hero',
    'manual_confirmation',
  ]).optional(),
  rank: z.coerce.number().pipe(rankBracketSchema).optional(),
  revision: z.coerce.number().int().nonnegative(),
});

const desktopFrameSchema = z.object({
  revision: z.number().int().nonnegative(),
  frameHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const desktopAnalysisResponseSchema = z.discriminatedUnion('status', [
  desktopFrameSchema.extend({
    status: z.literal('waiting'),
    reason: z.enum([
      'not_dota_draft',
      'image_unclear',
      'uncertain_picks',
      'insufficient_enemy_picks',
    ]),
    recognition: recognitionResponseSchema,
    quota: quotaSchema,
    liveSession: liveAnalysisSessionSchema.optional(),
  }),
  desktopFrameSchema.extend({
    status: z.literal('completed'),
    recognition: recognitionResponseSchema,
    analysis: analysisSchema,
    quota: quotaSchema,
    liveSession: liveAnalysisSessionSchema.optional(),
  }),
]);
