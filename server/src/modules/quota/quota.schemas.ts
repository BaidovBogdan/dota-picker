import { z } from 'zod';

export const quotaSchema = z.object({
  plan: z.enum(['free', 'pro']),
  remaining: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  nextRefillAt: z.iso.datetime().nullable(),
  planExpiresAt: z.iso.datetime().nullable(),
});
