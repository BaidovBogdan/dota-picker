import { z } from 'zod';
import { rankBracketSchema } from '../heroes/heroes.schemas.js';

export const draftSchema = z.object({
  source: z.enum(['manual', 'photo']).default('manual'),
  position: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  allyHeroIds: z.array(z.number().int().positive()).max(4).default([]),
  enemyHeroIds: z.array(z.number().int().positive()).min(1).max(5),
  bannedHeroIds: z.array(z.number().int().positive()).max(20).default([]),
  rank: rankBracketSchema.optional(),
}).superRefine((draft, context) => {
  const picks = [...draft.allyHeroIds, ...draft.enemyHeroIds, ...draft.bannedHeroIds];
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
    reliability: z.number().min(0).max(1).optional(),
    coverage: z.number().min(0).max(1).optional(),
    worstMatchup: z.number().min(0).max(1).optional(),
  }),
  scoreBreakdown: z.object({
    role: z.number(),
    matchup: z.number(),
    meta: z.number(),
    teamFit: z.number(),
    reliability: z.number(),
    advisor: z.number(),
    diversity: z.number(),
    total: z.number(),
  }).optional(),
  evidence: z.object({
    matchups: z.object({
      source: z.literal('opendota_rolling_all_ranks'),
      opponentsCovered: z.number().int().nonnegative(),
      opponentsTotal: z.number().int().nonnegative(),
      games: z.number().int().nonnegative(),
      minimumGames: z.number().int().nonnegative(),
      weightedWinRate: z.number().min(0).max(1).nullable(),
      expectedWinRate: z.number().min(0).max(1),
    }),
    meta: z.object({
      source: z.enum([
        'opendota_current_patch_30d_position',
        'opendota_rank_hero_stats',
        'opendota_public_hero_stats',
      ]),
      games: z.number().int().nonnegative(),
      wins: z.number().int().nonnegative(),
      winRate: z.number().min(0).max(1),
      rankScoped: z.boolean(),
      position: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      positionApproximate: z.boolean().nullable(),
      isStale: z.boolean(),
    }),
  }).optional(),
  reasons: z.array(z.enum([
    'strong_counter',
    'good_role_fit',
    'meta_favorite',
    'fills_team_need',
    'limited_matchup_data',
  ])),
});

export const recommendationProvenanceSchema = z.object({
  engineVersion: z.literal('hybrid-v2'),
  scoringVersion: z.literal('data-first-v2'),
  aiAssisted: z.boolean(),
  model: z.string().min(1).optional(),
  promptVersion: z.string().min(1).optional(),
  fallbackReason: z.enum([
    'not_configured',
    'insufficient_candidates',
    'timeout',
    'invalid_response',
    'provider_error',
  ]).optional(),
});

export const recommendationResultSchema = z.object({
  patch: z.string(),
  metaFetchedAt: z.iso.datetime(),
  recommendations: z.array(recommendationSchema).length(3),
  provenance: recommendationProvenanceSchema.optional(),
});
