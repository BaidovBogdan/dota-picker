import { z } from 'zod';

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});

export const idSchema = z.uuid();

export const idempotencyHeadersSchema = z.object({
  'idempotency-key': z.string().min(8).max(128),
});

export const paginationQuerySchema = z.object({
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const emptyResponseSchema = z.object({ success: z.literal(true) });
