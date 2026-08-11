import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sha256, stableStringify } from '../../lib/crypto.js';
import { errorResponseSchema } from '../../lib/schemas.js';
import type { OpenDotaAdapter } from './opendota.adapter.js';
import {
  heroDetailParamsSchema,
  heroDetailResponseSchema,
  heroesQuerySchema,
  heroesResponseSchema,
  metaPositionResponseSchema,
} from './heroes.schemas.js';

const heroCatalogCacheControl = 'public, max-age=300, stale-while-revalidate=3600';
const heroDetailCacheControl = 'public, max-age=60, stale-while-revalidate=300';

function setPublicCache(
  request: FastifyRequest,
  reply: FastifyReply,
  representation: unknown,
  cacheControl: string,
): boolean {
  const etag = `"${sha256(stableStringify(representation))}"`;
  reply.header('Cache-Control', cacheControl);
  reply.header('ETag', etag);
  const existingVary = reply.getHeader('Vary');
  const vary = new Set(
    String(existingVary ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  vary.add('Accept-Encoding');
  reply.header('Vary', [...vary].join(', '));
  const requestedEtags = request.headers['if-none-match']
    ?.split(',')
    .map((value) => value.trim());
  if (requestedEtags?.includes('*') || requestedEtags?.includes(etag)) {
    reply.code(304).send();
    return true;
  }
  return false;
}

export function heroesRoutes(adapter: OpenDotaAdapter): FastifyPluginAsyncZod {
  return async (app) => {
    app.get('/', {
      schema: {
        tags: ['Heroes'],
        querystring: heroesQuerySchema,
        response: { 200: heroesResponseSchema },
      },
    }, async (request, reply) => {
      const fetchedAt = new Date().toISOString();
      const [heroes, patch] = await Promise.all([
        adapter.getHeroes(request.query.rank),
        adapter.getPatch().catch(() => 'unknown'),
      ]);
      const payload = { heroes, patch, fetchedAt };
      if (setPublicCache(request, reply, { heroes, patch }, heroCatalogCacheControl)) return;
      return payload;
    });

    app.get('/meta', {
      schema: {
        tags: ['Heroes'],
        response: { 200: heroesResponseSchema.pick({ patch: true, fetchedAt: true }) },
      },
    }, async (request, reply) => {
      const payload = { patch: await adapter.getPatch(), fetchedAt: new Date().toISOString() };
      if (setPublicCache(request, reply, { patch: payload.patch }, heroDetailCacheControl)) return;
      return payload;
    });

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
    }, async (request, reply) => {
      const snapshot = await adapter.getMetaPositionSnapshot(request.query.rank);
      const heroes = snapshot.availability === 'ready'
        ? await adapter.getHeroes(request.query.rank)
        : [];
      const payload = { heroes, ...snapshot };
      if (snapshot.availability !== 'ready') {
        reply.header('Cache-Control', 'no-store');
        return payload;
      }
      const representation = { ...payload };
      Reflect.deleteProperty(representation, 'fetchedAt');
      if (setPublicCache(request, reply, representation, heroDetailCacheControl)) return;
      return payload;
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
    }, async (request, reply) => {
      const payload = await adapter.getHeroDetail(request.params.heroId);
      const representation = { ...payload };
      Reflect.deleteProperty(representation, 'generatedAt');
      if (setPublicCache(request, reply, representation, heroDetailCacheControl)) return;
      return payload;
    });
  };
}
