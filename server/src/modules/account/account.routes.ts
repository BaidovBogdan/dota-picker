import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { emptyResponseSchema } from '../../lib/schemas.js';
import type { AuthService } from '../auth/auth.service.js';
import { accountSchema, meResponseSchema } from '../auth/auth.schemas.js';
import { quotaSchema } from '../quota/quota.schemas.js';
import type { QuotaService } from '../quota/quota.service.js';

type Dependencies = {
  authService: AuthService;
  quotaService: QuotaService;
  allowQuotaReset: boolean;
};

export function accountRoutes(dependencies: Dependencies): FastifyPluginAsyncZod {
  return async (app) => {
    app.get('/me', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Account'],
        security: [{ bearerAuth: [] }],
        response: { 200: meResponseSchema },
      },
    }, async (request) => {
      const account = await dependencies.authService.getAccount(request.user.sub);
      return {
        account: accountSchema.parse({
          id: account.id,
          kind: account.kind,
          email: account.email,
          createdAt: account.createdAt.toISOString(),
          revenueCatAppUserId: account.id,
          quota: await dependencies.quotaService.get(account.id),
        }),
      };
    });

    app.get('/quota', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Account'],
        security: [{ bearerAuth: [] }],
        response: { 200: z.object({ quota: quotaSchema }) },
      },
    }, async (request) => ({ quota: await dependencies.quotaService.get(request.user.sub) }));

    if (dependencies.allowQuotaReset) {
      app.post('/quota/reset', {
        preHandler: app.authenticate,
        schema: {
          tags: ['Account'],
          security: [{ bearerAuth: [] }],
          response: { 200: z.object({ quota: quotaSchema }) },
        },
      }, async (request) => ({ quota: await dependencies.quotaService.reset(request.user.sub) }));
    }

    app.delete('/me', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Account'],
        security: [{ bearerAuth: [] }],
        response: { 200: emptyResponseSchema },
      },
    }, async (request) => {
      await dependencies.authService.deleteAccount(request.user.sub);
      return { success: true as const };
    });
  };
}
