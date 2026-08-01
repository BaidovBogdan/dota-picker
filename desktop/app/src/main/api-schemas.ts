import { z } from 'zod';
import { positionSchema, rankSchema } from '../shared/contracts.js';

export const quotaSchema = z.object({
  plan: z.enum(['free', 'pro']),
  remaining: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  nextRefillAt: z.string().datetime().nullable(),
  planExpiresAt: z.string().datetime().nullable(),
});

export const accountSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['guest', 'user']),
  email: z.string().email().nullable(),
  createdAt: z.string().datetime().optional(),
  revenueCatAppUserId: z.string(),
  quota: quotaSchema,
});

export const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(32),
  account: accountSchema,
});

export const otpChallengeSchema = z.object({
  challengeId: z.string().uuid(),
  purpose: z.enum(['register', 'login', 'upgrade_guest', 'password_reset', 'password_change']),
  expiresAt: z.string().datetime(),
  retryAfterSeconds: z.number().int().nonnegative(),
});

export const heroSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  localizedName: z.string().nullable(),
  primaryAttribute: z.enum(['str', 'agi', 'int', 'all']).optional(),
  attackType: z.enum(['Melee', 'Ranged']).optional(),
  roles: z.array(z.string()).optional(),
  imageUrl: z.string().url().optional(),
  iconUrl: z.string().url().optional(),
  picks: z.number().nonnegative().optional(),
  wins: z.number().nonnegative().optional(),
  winRate: z.number().min(0).max(1).optional(),
}).loose();

const recommendationSchema = z.object({
  hero: heroSchema,
  score: z.number(),
  confidence: z.enum(['low', 'medium', 'high']),
  reasons: z.array(z.string()),
}).loose();

export const analysisSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(['desktop', 'manual', 'photo']),
  input: z.object({
    source: z.enum(['desktop', 'manual', 'photo']),
    position: positionSchema,
    allyHeroIds: z.array(z.number().int().positive()).max(4),
    enemyHeroIds: z.array(z.number().int().positive()).min(1).max(5),
    bannedHeroIds: z.array(z.number().int().positive()).max(20).optional(),
    rank: rankSchema.optional(),
  }).loose(),
  result: z.object({
    patch: z.string(),
    metaFetchedAt: z.string().datetime(),
    recommendations: z.array(recommendationSchema).min(1),
    provenance: z.record(z.string(), z.unknown()).optional(),
  }).loose(),
  createdAt: z.string().datetime(),
}).loose();

export const historyResponseSchema = z.object({
  items: z.array(analysisSchema),
  nextCursor: z.string().nullable(),
});

export const recognitionSchema = z.object({
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
  model: z.string().optional(),
});

const desktopFrameSchema = z.object({
  revision: z.number().int().nonnegative(),
  frameHash: z.string().regex(/^[a-f0-9]{64}$/),
  quota: quotaSchema,
});

export const desktopAnalysisResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('waiting'),
    reason: z.enum([
      'not_dota_draft',
      'image_unclear',
      'uncertain_picks',
      'insufficient_enemy_picks',
      'no_enemy_picks',
    ]),
    revision: desktopFrameSchema.shape.revision,
    frameHash: desktopFrameSchema.shape.frameHash,
    quota: desktopFrameSchema.shape.quota,
    recognition: recognitionSchema,
  }),
  z.object({
    status: z.literal('completed'),
    revision: desktopFrameSchema.shape.revision,
    frameHash: desktopFrameSchema.shape.frameHash,
    quota: desktopFrameSchema.shape.quota,
    recognition: recognitionSchema,
    analysis: analysisSchema,
  }),
]);

export const billingResponseSchema = z.object({
  plan: z.enum(['free', 'pro']),
  entitlement: z.object({
    active: z.boolean(),
    expiresAt: z.string().datetime().nullable(),
  }).loose(),
}).loose();

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }).loose(),
});
