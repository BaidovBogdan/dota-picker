import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { UnauthorizedError } from '../../lib/errors.js';
import type { BillingService } from './billing.service.js';
import { billingStatusSchema, revenueCatWebhookSchema, webhookResponseSchema } from './billing.schemas.js';

type Dependencies = {
  config: AppConfig;
  billingService: BillingService;
};

function secretsEqual(provided: string | undefined, expected: string) {
  if (!provided) return false;
  const normalized = provided.startsWith('Bearer ') ? provided.slice(7) : provided;
  const left = Buffer.from(normalized);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function billingRoutes(dependencies: Dependencies): FastifyPluginAsyncZod {
  return async (app) => {
    app.get('/status', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Billing'],
        security: [{ bearerAuth: [] }],
        response: { 200: billingStatusSchema },
      },
    }, async (request) => dependencies.billingService.status(request.user.sub));

    app.post('/webhooks/revenuecat', {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['Billing'],
        hide: true,
        headers: z.object({ authorization: z.string().optional() }),
        body: revenueCatWebhookSchema,
        response: { 200: webhookResponseSchema, 503: webhookResponseSchema },
      },
    }, async (request, reply) => {
      if (!secretsEqual(request.headers.authorization, dependencies.config.revenueCat.webhookSecret)) {
        throw new UnauthorizedError('TOKEN_INVALID', 'Invalid webhook authorization');
      }
      const result = await dependencies.billingService.applyRevenueCatEvent(request.body);
      const response = { received: true as const, processed: result === 'processed' };
      return result === 'pending' ? reply.status(503).send(response) : response;
    });
  };
}
