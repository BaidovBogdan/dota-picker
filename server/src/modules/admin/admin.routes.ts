import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AppConfig } from '../../config/env.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { errorResponseSchema } from '../../lib/schemas.js';
import { secureEqual } from '../../lib/secure-equal.js';
import {
  adminAnalysesQuerySchema,
  adminAnalysesResponseSchema,
  adminHeadersSchema,
  adminMetaQuerySchema,
  adminMetaResponseSchema,
  adminSessionInputSchema,
  adminSessionResponseSchema,
  adminSystemResponseSchema,
  adminUsersQuerySchema,
  adminUsersResponseSchema,
  grantProAllInputSchema,
  grantProAllResponseSchema,
  overviewQuerySchema,
  overviewResponseSchema,
} from './admin.schemas.js';
import type { AdminService } from './admin.service.js';

type Dependencies = {
  config: AppConfig;
  adminService: AdminService;
};

const adminSessionTtlSeconds = 15 * 60;

export function adminRoutes(dependencies: Dependencies): FastifyPluginAsyncZod {
  return async (app) => {
    app.post('/session', {
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Admin'],
        body: adminSessionInputSchema,
        response: {
          200: adminSessionResponseSchema,
          401: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    }, async (request) => {
      if (
        !dependencies.config.adminApiKey
        || !secureEqual(request.body.key, dependencies.config.adminApiKey)
      ) {
        throw new UnauthorizedError('ADMIN_AUTH_REQUIRED', 'Invalid admin credentials');
      }
      const now = Date.now();
      return {
        token: app.jwt.sign({
          sub: 'counterpick-admin',
          kind: 'user',
          type: 'admin',
          ver: 0,
        }, { expiresIn: adminSessionTtlSeconds }),
        expiresAt: new Date(now + adminSessionTtlSeconds * 1_000).toISOString(),
      };
    });

    app.get('/overview', {
      preHandler: app.authenticateAdmin,
      schema: {
        tags: ['Admin'],
        security: [{ adminBearerAuth: [] }, { adminApiKey: [] }],
        headers: adminHeadersSchema,
        querystring: overviewQuerySchema,
        response: {
          200: overviewResponseSchema,
          401: errorResponseSchema,
        },
      },
    }, async (request) => dependencies.adminService.overview(request.query));

    app.get('/users', {
      preHandler: app.authenticateAdmin,
      schema: {
        tags: ['Admin'],
        security: [{ adminBearerAuth: [] }, { adminApiKey: [] }],
        headers: adminHeadersSchema,
        querystring: adminUsersQuerySchema,
        response: {
          200: adminUsersResponseSchema,
          401: errorResponseSchema,
        },
      },
    }, async (request) => dependencies.adminService.listUsers(request.query));

    app.get('/analyses', {
      preHandler: app.authenticateAdmin,
      schema: {
        tags: ['Admin'],
        security: [{ adminBearerAuth: [] }, { adminApiKey: [] }],
        headers: adminHeadersSchema,
        querystring: adminAnalysesQuerySchema,
        response: {
          200: adminAnalysesResponseSchema,
          401: errorResponseSchema,
        },
      },
    }, async (request) => dependencies.adminService.listAnalyses(request.query));

    app.get('/meta', {
      preHandler: app.authenticateAdmin,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['Admin'],
        security: [{ adminBearerAuth: [] }, { adminApiKey: [] }],
        headers: adminHeadersSchema,
        querystring: adminMetaQuerySchema,
        response: {
          200: adminMetaResponseSchema,
          401: errorResponseSchema,
          429: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    }, async (request) => dependencies.adminService.meta(request.query));

    app.get('/system', {
      preHandler: app.authenticateAdmin,
      schema: {
        tags: ['Admin'],
        security: [{ adminBearerAuth: [] }, { adminApiKey: [] }],
        headers: adminHeadersSchema,
        response: {
          200: adminSystemResponseSchema,
          401: errorResponseSchema,
        },
      },
    }, async () => dependencies.adminService.system());

    app.post('/grants/pro-all', {
      preHandler: app.authenticateAdmin,
      config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
      schema: {
        tags: ['Admin'],
        security: [{ adminBearerAuth: [] }, { adminApiKey: [] }],
        headers: adminHeadersSchema,
        body: grantProAllInputSchema,
        response: {
          200: grantProAllResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    }, async (request) => dependencies.adminService.grantProToAllFreeAccounts(
      request.headers.authorization?.startsWith('Bearer ') ? 'admin-session' : 'legacy-admin-key',
    ));
  };
}
