import { z } from 'zod';
import { quotaSchema } from '../quota/quota.schemas.js';

export const billingStatusSchema = z.object({
  revenueCatAppUserId: z.string(),
  plan: z.enum(['free', 'pro']),
  entitlement: z.object({
    id: z.string(),
    active: z.boolean(),
    productId: z.string().nullable(),
    expiresAt: z.iso.datetime().nullable(),
  }),
  quota: quotaSchema,
});

export const revenueCatWebhookSchema = z.object({
  api_version: z.string().optional(),
  event: z.object({
    id: z.string().min(1).max(256),
    type: z.string().min(1).max(128),
    app_user_id: z.string().min(1).max(256).nullish(),
    original_app_user_id: z.string().min(1).max(256).nullish(),
    aliases: z.array(z.string().min(1).max(256)).nullish(),
    transferred_from: z.array(z.string().min(1).max(256)).nullish(),
    transferred_to: z.array(z.string().min(1).max(256)).nullish(),
    app_id: z.string().min(1).max(256).nullish(),
    environment: z.enum(['SANDBOX', 'PRODUCTION']).nullish(),
    product_id: z.string().max(256).nullable().optional(),
    entitlement_id: z.string().max(256).nullish(),
    entitlement_ids: z.array(z.string()).nullish(),
    expiration_at_ms: z.number().int().nullable().optional(),
    event_timestamp_ms: z.number().int().optional(),
  }).loose(),
}).loose();

export const webhookResponseSchema = z.object({
  received: z.literal(true),
  processed: z.boolean(),
});
