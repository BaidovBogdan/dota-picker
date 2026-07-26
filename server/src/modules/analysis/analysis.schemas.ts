import { z } from 'zod';
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

