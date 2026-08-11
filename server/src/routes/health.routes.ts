import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Database } from '../db/client.js';

const healthSchema = z.object({ status: z.enum(['ok', 'ready', 'not_ready']) });

export function healthRoutes(
  db: Database,
  isApplicationReady?: () => Promise<boolean>,
): FastifyPluginAsyncZod {
  return async (app) => {
    app.get('/live', {
      schema: { tags: ['Health'], response: { 200: healthSchema } },
    }, async () => ({ status: 'ok' as const }));

    app.get('/ready', {
      schema: { tags: ['Health'], response: { 200: healthSchema, 503: healthSchema } },
    }, async (_request, reply) => {
      try {
        await db.execute(sql`select 1`);
        if (isApplicationReady && !(await isApplicationReady())) {
          return await reply.status(503).send({ status: 'not_ready' as const });
        }
        return { status: 'ready' as const };
      } catch {
        return reply.status(503).send({ status: 'not_ready' as const });
      }
    });
  };
}
