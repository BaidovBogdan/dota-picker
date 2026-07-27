import { z } from 'zod';
import { quotaSchema } from '../quota/quota.schemas.js';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const passwordSchema = z.string().min(10).max(128);

export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const otpCodeSchema = z.string().regex(/^\d{4}$/);

export const otpVerificationSchema = z.object({
  challengeId: z.uuid(),
  code: otpCodeSchema,
});

export const verifiedCredentialsSchema = credentialsSchema.extend(otpVerificationSchema.shape);

export const publicOtpRequestSchema = z.discriminatedUnion('purpose', [
  z.object({
    purpose: z.literal('register'),
    email: emailSchema,
  }),
  z.object({
    purpose: z.literal('login'),
    email: emailSchema,
    password: passwordSchema,
  }),
  z.object({
    purpose: z.literal('password_reset'),
    email: emailSchema,
  }),
]);

export const authenticatedOtpRequestSchema = z.discriminatedUnion('purpose', [
  z.object({
    purpose: z.literal('upgrade_guest'),
    email: emailSchema,
  }),
  z.object({
    purpose: z.literal('password_change'),
  }),
]);

export const otpChallengeResponseSchema = z.object({
  challengeId: z.uuid(),
  purpose: z.enum(['register', 'login', 'upgrade_guest', 'password_reset', 'password_change']),
  expiresAt: z.iso.datetime(),
  retryAfterSeconds: z.number().int().nonnegative(),
});

export const passwordResetSchema = otpVerificationSchema.extend({
  email: emailSchema,
  newPassword: passwordSchema,
});

export const passwordChangeSchema = otpVerificationSchema.extend({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
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
