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

