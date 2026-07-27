import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { AppConfig } from '../../config/env.js';
import { errorResponseSchema, emptyResponseSchema } from '../../lib/schemas.js';
import type { QuotaService } from '../quota/quota.service.js';
import {
  authenticatedOtpRequestSchema,
  authResponseSchema,
  guestAuthSchema,
  otpChallengeResponseSchema,
  passwordChangeSchema,
  passwordResetSchema,
  publicOtpRequestSchema,
  refreshSchema,
  verifiedCredentialsSchema,
} from './auth.schemas.js';
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
      config: { rateLimit: { max: 8, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Auth'],
        body: verifiedCredentialsSchema,
        response: {
          201: authResponseSchema,
          400: errorResponseSchema,
          410: errorResponseSchema,
          429: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    }, async (request, reply) => {
      const account = await dependencies.authService.register(
        request.body.email,
        request.body.password,
        { challengeId: request.body.challengeId, code: request.body.code },
      );
      return reply.status(201).send(await responseFor(account, context(request)));
    });

    app.post('/login', {
      config: { rateLimit: { max: 8, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Auth'],
        body: verifiedCredentialsSchema,
        response: {
          200: authResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          410: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    }, async (request) => {
      const account = await dependencies.authService.login(
        request.body.email,
        request.body.password,
        { challengeId: request.body.challengeId, code: request.body.code },
      );
      return responseFor(account, context(request));
    });

    app.post('/upgrade-guest', {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 8, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        body: verifiedCredentialsSchema,
        response: {
          200: authResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          410: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    }, async (request) => {
      const account = await dependencies.authService.upgradeGuest(
        request.user.sub,
        request.body.email,
        request.body.password,
        { challengeId: request.body.challengeId, code: request.body.code },
      );
      return responseFor(account, context(request));
    });

    app.post('/otp/request', {
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Auth'],
        body: publicOtpRequestSchema,
        response: {
          202: otpChallengeResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          429: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    }, async (request, reply) => {
      const challenge = await dependencies.authService.requestPublicOtp(request.body);
      return reply.status(202).send(challenge);
    });

    app.post('/otp/request-authenticated', {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        body: authenticatedOtpRequestSchema,
        response: {
          202: otpChallengeResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          429: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    }, async (request, reply) => {
      const challenge = await dependencies.authService.requestAuthenticatedOtp(
        request.user.sub,
        request.body,
      );
      return reply.status(202).send(challenge);
    });

    app.post('/password/reset', {
      config: { rateLimit: { max: 6, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Auth'],
        body: passwordResetSchema,
        response: {
          200: authResponseSchema,
          400: errorResponseSchema,
          410: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    }, async (request) => {
      const account = await dependencies.authService.resetPassword(
        request.body.email,
        request.body.newPassword,
        { challengeId: request.body.challengeId, code: request.body.code },
      );
      return responseFor(account, context(request));
    });

    app.post('/password/change', {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 6, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        body: passwordChangeSchema,
        response: {
          200: authResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          410: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    }, async (request) => {
      const account = await dependencies.authService.changePassword(
        request.user.sub,
        request.body.currentPassword,
        request.body.newPassword,
        { challengeId: request.body.challengeId, code: request.body.code },
      );
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
