import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponseSchema } from '../../lib/schemas.js';
import type { OpenDotaAdapter } from './opendota.adapter.js';
import {
  heroDetailParamsSchema,
  heroDetailResponseSchema,
  heroesQuerySchema,
  heroesResponseSchema,
  metaPositionResponseSchema,
} from './heroes.schemas.js';

export function heroesRoutes(adapter: OpenDotaAdapter): FastifyPluginAsyncZod {
  return async (app) => {
    app.get('/', {
      schema: {
        tags: ['Heroes'],
        querystring: heroesQuerySchema,
        response: { 200: heroesResponseSchema },
      },
    }, async (request) => {
      const fetchedAt = new Date().toISOString();
      const [heroes, patch] = await Promise.all([
        adapter.getHeroes(request.query.rank),
        adapter.getPatch().catch(() => 'unknown'),
      ]);
      return { heroes, patch, fetchedAt };
    });

    app.get('/meta', {
      schema: {
        tags: ['Heroes'],
        response: { 200: heroesResponseSchema.pick({ patch: true, fetchedAt: true }) },
      },
    }, async () => ({ patch: await adapter.getPatch(), fetchedAt: new Date().toISOString() }));

    app.get('/meta-positions', {
      preHandler: app.rateLimit({
        max: 15,
        timeWindow: '1 minute',
        groupId: 'hero-position-meta',
        keyGenerator: (request) => request.ip,
      }),
      schema: {
        tags: ['Heroes'],
        querystring: heroesQuerySchema,
        response: {
          200: metaPositionResponseSchema,
          429: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    }, async (request) => {
      const [heroes, snapshot] = await Promise.all([
        adapter.getHeroes(request.query.rank),
        adapter.getMetaPositionSnapshot(request.query.rank),
      ]);
      return { heroes, ...snapshot };
    });

    app.get('/:heroId/detail', {
      preHandler: app.rateLimit({
        max: 30,
        timeWindow: '1 minute',
        groupId: 'hero-detail',
        keyGenerator: (request) => request.ip,
      }),
      schema: {
        tags: ['Heroes'],
        params: heroDetailParamsSchema,
        response: {
          200: heroDetailResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    }, async (request) => adapter.getHeroDetail(request.params.heroId));
  };
}
