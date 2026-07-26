import { z } from 'zod';

export const recognitionOutputSchema = z.object({
  quality: z.enum(['clear', 'partial', 'not_dota', 'too_blurry']),
  recognized: z.array(z.object({
    side: z.enum(['ally', 'enemy', 'unknown']),
    slot: z.number().int().min(0).max(4),
    heroName: z.string(),
    confidence: z.number().min(0).max(1),
  })).max(10),
});

export const recognitionResponseSchema = z.object({
  quality: z.enum(['clear', 'partial', 'not_dota', 'too_blurry']),
  recognized: z.array(z.object({
    side: z.enum(['ally', 'enemy', 'unknown']),
    slot: z.number().int().min(0).max(4),
    heroId: z.number().int().positive().nullable(),
    heroName: z.string(),
    localizedName: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    needsReview: z.boolean(),
  })).max(10),
  model: z.string(),
});

