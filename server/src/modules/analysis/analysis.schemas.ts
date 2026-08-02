import { z } from 'zod';
import { rankBracketSchema } from '../heroes/heroes.schemas.js';
import { recognitionResponseSchema } from '../photo/photo.schemas.js';
import { quotaSchema } from '../quota/quota.schemas.js';
import { draftSchema, recommendationResultSchema } from '../recommendation/recommendation.schemas.js';

export const analysisSchema = z.object({
  id: z.uuid(),
  status: z.literal('completed'),
  source: z.enum(['manual', 'photo']),
  input: draftSchema,
  result: recommendationResultSchema,
  createdAt: z.iso.datetime(),
});

export const analysisResponseSchema = z.object({
  analysis: analysisSchema,
  quota: quotaSchema,
});

export const historyItemSchema = analysisSchema.pick({
  id: true,
  source: true,
  input: true,
  result: true,
  createdAt: true,
});

export const historyResponseSchema = z.object({
  items: z.array(historyItemSchema),
  nextCursor: z.string().nullable(),
});

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
  }),
  desktopFrameSchema.extend({
    status: z.literal('completed'),
    recognition: recognitionResponseSchema,
    analysis: analysisSchema,
    quota: quotaSchema,
  }),
]);
