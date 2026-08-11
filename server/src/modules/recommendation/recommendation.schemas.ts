import { z } from 'zod';
import { rankBracketSchema } from '../heroes/heroes.schemas.js';

export const draftSchema = z.object({
  source: z.enum(['manual', 'photo', 'overwolf']).default('manual'),
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
      source: z.enum([
        'opendota_rolling_all_ranks',
        'opendota_current_patch_rank_pairs',
        'opendota_current_patch_all_ranks_pairs',
        'opendota_recent_public_rank_pairs',
        'opendota_recent_public_all_ranks_pairs',
      ]),
      opponentsCovered: z.number().int().nonnegative(),
      opponentsTotal: z.number().int().nonnegative(),
      games: z.number().int().nonnegative(),
      minimumGames: z.number().int().nonnegative(),
      weightedWinRate: z.number().min(0).max(1).nullable(),
      expectedWinRate: z.number().min(0).max(1),
      patch: z.string().min(1).optional(),
      rank: rankBracketSchema.nullable().optional(),
      rankScoped: z.boolean().optional(),
      rankOpponentsCovered: z.number().int().nonnegative().optional(),
      rankGames: z.number().int().nonnegative().optional(),
      patchGames: z.number().int().nonnegative().optional(),
      minimumPatchGames: z.number().int().nonnegative().optional(),
      isStale: z.boolean().optional(),
      availability: z.enum(['ready', 'collecting', 'unavailable']).optional(),
      byOpponent: z.array(z.object({
        heroId: z.number().int().positive(),
        rankGames: z.number().int().nonnegative(),
        rankWins: z.number().int().nonnegative(),
        patchGames: z.number().int().nonnegative(),
        patchWins: z.number().int().nonnegative(),
        winRate: z.number().min(0).max(1),
        expectedWinRate: z.number().min(0).max(1),
        advantage: z.number().min(-1).max(1),
        reliability: z.number().min(0).max(1),
      })).max(5).optional(),
    }),
    synergy: z.object({
      source: z.enum([
        'opendota_current_patch_rank_pairs',
        'opendota_current_patch_all_ranks_pairs',
        'opendota_recent_public_rank_pairs',
        'opendota_recent_public_all_ranks_pairs',
        'team_composition_only',
      ]),
      alliesCovered: z.number().int().nonnegative(),
      alliesTotal: z.number().int().nonnegative(),
      rankAlliesCovered: z.number().int().nonnegative(),
      games: z.number().int().nonnegative(),
      rankGames: z.number().int().nonnegative(),
      patchGames: z.number().int().nonnegative(),
      minimumGames: z.number().int().nonnegative(),
      weightedWinRate: z.number().min(0).max(1).nullable(),
      expectedWinRate: z.number().min(0).max(1).nullable(),
      pairScore: z.number().min(0).max(1),
      compositionScore: z.number().min(0).max(1),
      reliability: z.number().min(0).max(1),
      patch: z.string().min(1).nullable(),
      rank: rankBracketSchema.nullable(),
      rankScoped: z.boolean(),
      isStale: z.boolean(),
      availability: z.enum(['ready', 'collecting', 'unavailable']),
      byAlly: z.array(z.object({
        heroId: z.number().int().positive(),
        rankGames: z.number().int().nonnegative(),
        rankWins: z.number().int().nonnegative(),
        patchGames: z.number().int().nonnegative(),
        patchWins: z.number().int().nonnegative(),
        winRate: z.number().min(0).max(1),
        expectedWinRate: z.number().min(0).max(1),
        advantage: z.number().min(-1).max(1),
        reliability: z.number().min(0).max(1),
      })).max(4),
    }).optional(),
    meta: z.object({
      source: z.enum([
        'opendota_current_patch_30d_position',
        'opendota_current_patch_parsed_position',
        'opendota_rolling_lane_role_scenarios',
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
    'strong_synergy',
    'stable_across_draft',
    'limited_matchup_data',
  ])),
});

export const recommendationProvenanceSchema = z.object({
  engineVersion: z.enum(['hybrid-v2', 'deterministic-v3']),
  scoringVersion: z.enum(['data-first-v2', 'draft-pairs-v3']),
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

const draftDataHealthSchema = z.object({
  snapshotId: z.uuid().nullable(),
  snapshotVersion: z.literal(1),
  source: z.enum([
    'opendota_public_matches_explorer_positions',
    'opendota_public_matches_lane_roles',
  ]),
  population: z.object({
    id: z.enum(['ranked_all_pick', 'public_all_pick']),
    version: z.literal(1),
    audience: z.literal('opendota_recent_public_sample'),
    lobbyTypes: z.array(z.number().int().nonnegative()).max(16),
    gameModes: z.array(z.number().int().nonnegative()).min(1).max(32),
    minimumMatches: z.number().int().positive(),
  }),
  fallbackFrom: z.enum(['ranked_all_pick', 'public_all_pick']).nullable(),
  matchCount: z.number().int().nonnegative(),
  minimumMatches: z.number().int().positive(),
  rankMatchCounts: z.record(z.string(), z.number().int().nonnegative()),
  generatedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  availability: z.enum(['ready', 'collecting', 'unavailable']),
  isStale: z.boolean(),
});

export const recommendationResultSchema = z.object({
  patch: z.string(),
  metaFetchedAt: z.iso.datetime(),
  recommendations: z.array(recommendationSchema).length(3),
  provenance: recommendationProvenanceSchema.optional(),
  dataHealth: draftDataHealthSchema.optional(),
  draftCompleteness: z.object({
    bans: z.enum(['known', 'unknown']),
  }).optional(),
});
