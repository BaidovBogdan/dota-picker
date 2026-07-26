import { z } from 'zod';
import { rankBracketSchema } from '../heroes/heroes.schemas.js';

export const draftSchema = z.object({
  source: z.enum(['manual', 'photo']).default('manual'),
  position: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  allyHeroIds: z.array(z.number().int().positive()).max(4).default([]),
  enemyHeroIds: z.array(z.number().int().positive()).min(1).max(5),
  rank: rankBracketSchema.optional(),
}).superRefine((draft, context) => {
  const picks = [...draft.allyHeroIds, ...draft.enemyHeroIds];
  if (new Set(picks).size !== picks.length) {
    context.addIssue({ code: 'custom', message: 'A hero can appear only once in a draft' });
  }
});

export const recommendationSchema = z.object({
  hero: z.object({
    id: z.number().int().positive(),
    name: z.string(),
    localizedName: z.string(),
    imageUrl: z.url(),
    iconUrl: z.url(),
    roles: z.array(z.string()),
  }),
  score: z.number().int().min(0).max(100),
  confidence: z.enum(['low', 'medium', 'high']),
  metrics: z.object({
    roleFit: z.number().min(0).max(1),
    counter: z.number().min(0).max(1),
    meta: z.number().min(0).max(1),
    synergy: z.number().min(0).max(1),
  }),
  reasons: z.array(z.enum([
    'strong_counter',
    'good_role_fit',
    'meta_favorite',
    'fills_team_need',
    'limited_matchup_data',
  ])),
});

export const recommendationResultSchema = z.object({
  patch: z.string(),
  metaFetchedAt: z.iso.datetime(),
  recommendations: z.array(recommendationSchema).length(3),
});
