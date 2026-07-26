import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AppConfig } from '../../config/env.js';
import { errorResponseSchema, emptyResponseSchema } from '../../lib/schemas.js';
import type { QuotaService } from '../quota/quota.service.js';
import { authResponseSchema, credentialsSchema, guestAuthSchema, refreshSchema } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

type Dependencies = {
  config: AppConfig;
  authService: AuthService;
  quotaService: QuotaService;
};

export function authRoutes(dependencies: Dependencies): FastifyPluginAsyncZod {
  return async (app) => {
    const context = (request: FastifyRequest) => ({
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
    });

    const responseFor = async (account: { id: string; kind: 'guest' | 'user'; email: string | null; createdAt: Date; tokenVersion: number }, requestContext: ReturnType<typeof context>, refreshToken?: string) => ({
      accessToken: app.jwt.sign({ sub: account.id, kind: account.kind, type: 'access', ver: account.tokenVersion }),
      refreshToken: refreshToken ?? await dependencies.authService.createRefreshToken(
        account.id,
        { kind: account.kind, tokenVersion: account.tokenVersion },
        requestContext,
      ),
      account: {
        id: account.id,
        kind: account.kind,
        email: account.email,
        createdAt: account.createdAt.toISOString(),
        revenueCatAppUserId: account.id,
        quota: await dependencies.quotaService.get(account.id),
      },
    });

    app.post('/guest', {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        body: guestAuthSchema,
        response: { 200: authResponseSchema, 401: errorResponseSchema, 409: errorResponseSchema },
      },
    }, async (request) => {
      const account = await dependencies.authService.findOrCreateGuest(request.body.deviceId);
      return responseFor(account, context(request));
    });

    app.post('/register', {
      config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        body: credentialsSchema,
        response: { 201: authResponseSchema, 401: errorResponseSchema, 409: errorResponseSchema },
      },
    }, async (request, reply) => {
      const account = await dependencies.authService.register(request.body.email, request.body.password);
      return reply.status(201).send(await responseFor(account, context(request)));
    });

    app.post('/login', {
      config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        body: credentialsSchema,
        response: { 200: authResponseSchema, 401: errorResponseSchema },
      },
    }, async (request) => {
      const account = await dependencies.authService.login(request.body.email, request.body.password);
      return responseFor(account, context(request));
    });

    app.post('/upgrade-guest', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        body: credentialsSchema,
        response: { 200: authResponseSchema, 401: errorResponseSchema, 409: errorResponseSchema },
      },
    }, async (request) => {
      const account = await dependencies.authService.upgradeGuest(request.user.sub, request.body.email, request.body.password);
      return responseFor(account, context(request));
    });

    app.post('/refresh', {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        body: refreshSchema,
        response: { 200: authResponseSchema, 401: errorResponseSchema },
      },
    }, async (request) => {
      const rotated = await dependencies.authService.rotateRefreshToken(request.body.refreshToken, context(request));
      return responseFor(rotated.account, context(request), rotated.refreshToken);
    });

    app.post('/logout', {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        body: refreshSchema,
        response: { 200: emptyResponseSchema },
      },
    }, async (request) => {
      await dependencies.authService.revokeRefreshToken(request.body.refreshToken);
      return { success: true as const };
    });

  };
}
