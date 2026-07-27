import { z } from 'zod';

export const rankBracketSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(4),
  z.literal(5), z.literal(6), z.literal(7), z.literal(8),
]);

export const heroSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  localizedName: z.string(),
  primaryAttribute: z.enum(['str', 'agi', 'int', 'all']),
  attackType: z.enum(['Melee', 'Ranged']),
  roles: z.array(z.string()),
  imageUrl: z.url(),
  iconUrl: z.url(),
  picks: z.number().nonnegative(),
  wins: z.number().nonnegative(),
  winRate: z.number().min(0).max(1),
});

export const heroesQuerySchema = z.object({ rank: z.coerce.number().pipe(rankBracketSchema).optional() });

export const heroesResponseSchema = z.object({
  heroes: z.array(heroSchema),
  patch: z.string(),
  fetchedAt: z.iso.datetime(),
});

export const heroDetailParamsSchema = z.object({
  heroId: z.coerce.number().int().positive(),
});

const patchSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  releasedAt: z.iso.datetime().nullable(),
});

const rankWinRateSchema = z.object({
  rank: rankBracketSchema,
  games: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1).nullable(),
  window: z.literal('rolling_7d'),
});

const heroBuildItemSchema = z.object({
  id: z.number().int().nonnegative(),
  slug: z.string().min(1),
  name: z.string().min(1),
  imageUrl: z.url().nullable(),
  order: z.number().int().positive(),
  medianPurchaseSec: z.number().int().nonnegative(),
  p25PurchaseSec: z.number().int().nonnegative(),
  p75PurchaseSec: z.number().int().nonnegative(),
});

const heroBuildVariantSchema = z.object({
  id: z.string().min(1),
  games: z.number().int().positive(),
  wins: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  items: z.array(heroBuildItemSchema).min(3),
  source: z.literal('parsed_current_patch'),
});

export const heroDetailResponseSchema = z.object({
  hero: heroSchema,
  patch: patchSchema,
  generatedAt: z.iso.datetime(),
  isStale: z.boolean(),
  rankWinRates: z.array(rankWinRateSchema).length(8),
  builds: z.array(heroBuildVariantSchema).max(3),
  buildSampleSize: z.number().int().nonnegative(),
  availability: z.object({
    builds: z.enum(['ready', 'collecting', 'unavailable']),
  }),
});

const heroPositionSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const heroPositionStatSchema = z.object({
  heroId: z.number().int().positive(),
  position: heroPositionSchema,
  picks: z.number().int().positive(),
  wins: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  isApproximate: z.boolean(),
  method: z.enum(['lane_role', 'lane_role_farm_priority']),
});

export const metaPositionResponseSchema = z.object({
  heroes: z.array(heroSchema),
  patch: z.string().min(1),
  rank: rankBracketSchema.nullable(),
  rankFilter: z.enum(['average_match_rank', 'all_ranks']),
  window: z.literal('current_patch_30d'),
  minimumGames: z.number().int().positive(),
  fetchedAt: z.iso.datetime(),
  isStale: z.boolean(),
  availability: z.enum(['ready', 'collecting']),
  positionStats: z.array(heroPositionStatSchema),
});
