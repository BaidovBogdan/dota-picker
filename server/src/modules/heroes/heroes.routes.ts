import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { OpenDotaAdapter } from './opendota.adapter.js';
import { heroesQuerySchema, heroesResponseSchema } from './heroes.schemas.js';

export function heroesRoutes(adapter: OpenDotaAdapter): FastifyPluginAsyncZod {
  return async (app) => {
    app.get('/', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Heroes'],
        security: [{ bearerAuth: [] }],
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
      preHandler: app.authenticate,
      schema: {
        tags: ['Heroes'],
        security: [{ bearerAuth: [] }],
        response: { 200: heroesResponseSchema.pick({ patch: true, fetchedAt: true }) },
      },
    }, async () => ({ patch: await adapter.getPatch(), fetchedAt: new Date().toISOString() }));
  };
}
