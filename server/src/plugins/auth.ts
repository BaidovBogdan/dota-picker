import jwt from '@fastify/jwt';
import { eq } from 'drizzle-orm';
import fp from 'fastify-plugin';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { accounts } from '../db/schema.js';
import { UnauthorizedError } from '../lib/errors.js';
import { secureEqual } from '../lib/secure-equal.js';

function isAccessToken(value: unknown) {
  return typeof value === 'object'
    && value !== null
    && 'type' in value
    && value.type === 'access'
    && 'sub' in value
    && typeof value.sub === 'string'
    && 'ver' in value
    && typeof value.ver === 'number';
}

function isAdminToken(value: unknown) {
  return typeof value === 'object'
    && value !== null
    && 'type' in value
    && value.type === 'admin'
    && 'sub' in value
    && value.sub === 'counterpick-admin';
}

export const authPlugin = fp<{ config: AppConfig; db: Database }>(async (app, options) => {
  await app.register(jwt, {
    secret: options.config.jwtSecret,
    sign: { expiresIn: options.config.accessTokenTtl },
  });

  app.decorate('authenticate', async (request) => {
    try {
      await request.jwtVerify();
      if (!isAccessToken(request.user)) {
        throw new UnauthorizedError('TOKEN_INVALID', 'Invalid access token');
      }
      const [account] = await options.db
        .select({ tokenVersion: accounts.tokenVersion, kind: accounts.kind })
        .from(accounts)
        .where(eq(accounts.id, request.user.sub))
        .limit(1);
      if (!account) {
        throw new UnauthorizedError('TOKEN_INVALID', 'Access token has been revoked');
      }
      if (account.tokenVersion !== request.user.ver || account.kind !== request.user.kind) {
        throw new UnauthorizedError('TOKEN_INVALID', 'Access token has been revoked');
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new UnauthorizedError('TOKEN_INVALID', 'Access token is invalid or expired');
    }
  });

  app.decorate('authenticateAdmin', async (request) => {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      try {
        const payload = await request.jwtVerify();
        if (!isAdminToken(payload)) {
          throw new UnauthorizedError('ADMIN_AUTH_REQUIRED', 'A valid admin session is required');
        }
        return;
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          throw error;
        }
        throw new UnauthorizedError('ADMIN_AUTH_REQUIRED', 'Admin session is invalid or expired');
      }
    }

    const provided = request.headers['x-admin-key'];
    if (
      !options.config.adminApiKey
      || typeof provided !== 'string'
      || !secureEqual(provided, options.config.adminApiKey)
    ) {
      throw new UnauthorizedError('ADMIN_AUTH_REQUIRED', 'A valid admin session is required');
    }
  });
});
