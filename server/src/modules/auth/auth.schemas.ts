import { z } from 'zod';
import { quotaSchema } from '../quota/quota.schemas.js';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const passwordSchema = z.string().min(10).max(128);

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const guestAuthSchema = z.object({
  deviceId: z.string().min(16).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(256),
});

export const accountSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['guest', 'user']),
  email: z.email().nullable(),
  createdAt: z.iso.datetime(),
  revenueCatAppUserId: z.string(),
  quota: quotaSchema,
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  account: accountSchema,
});

export const meResponseSchema = z.object({ account: accountSchema });
