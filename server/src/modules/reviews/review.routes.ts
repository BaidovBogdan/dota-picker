import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { emptyResponseSchema, errorResponseSchema } from '../../lib/schemas.js';
import {
  accountReviewsQuerySchema,
  accountReviewsResponseSchema,
  adminReviewsQuerySchema,
  adminReviewsResponseSchema,
  reviewResponseSchema,
  upsertReviewSchema,
} from './review.schemas.js';
import type { ReviewService } from './review.service.js';

type Dependencies = {
  reviewService: ReviewService;
};

const idParamsSchema = z.object({ id: z.uuid() });
const adminHeadersSchema = z.object({
  authorization: z.string().min(1).optional(),
  'x-admin-key': z.string().min(1).optional(),
});

export function reviewRoutes(dependencies: Dependencies): FastifyPluginAsyncZod {
  return async (app) => {
    app.post('/analyses/:id/review', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Reviews'],
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: upsertReviewSchema,
        response: {
          200: reviewResponseSchema,
          404: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    }, async (request) => ({
      review: await dependencies.reviewService.upsert(
        request.user.sub,
        request.params.id,
        request.body,
      ),
    }));

    app.get('/account/reviews', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Reviews'],
        security: [{ bearerAuth: [] }],
        querystring: accountReviewsQuerySchema,
        response: {
          200: accountReviewsResponseSchema,
          422: errorResponseSchema,
        },
      },
    }, async (request) => dependencies.reviewService.listForAccount(
      request.user.sub,
      request.query,
    ));

    app.delete('/account/reviews/:id', {
      preHandler: app.authenticate,
      schema: {
        tags: ['Reviews'],
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        response: {
          200: emptyResponseSchema,
          404: errorResponseSchema,
        },
      },
    }, async (request) => {
      await dependencies.reviewService.deleteForAccount(request.user.sub, request.params.id);
      return { success: true as const };
    });

    app.get('/admin/reviews', {
      preHandler: app.authenticateAdmin,
      schema: {
        tags: ['Admin'],
        security: [{ adminBearerAuth: [] }, { adminApiKey: [] }],
        headers: adminHeadersSchema,
        querystring: adminReviewsQuerySchema,
        response: {
          200: adminReviewsResponseSchema,
          401: errorResponseSchema,
        },
      },
    }, async (request) => dependencies.reviewService.listForAdmin(request.query));

    app.delete('/admin/reviews/:id', {
      preHandler: app.authenticateAdmin,
      schema: {
        tags: ['Admin'],
        security: [{ adminBearerAuth: [] }, { adminApiKey: [] }],
        headers: adminHeadersSchema,
        params: idParamsSchema,
        response: {
          200: emptyResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    }, async (request) => {
      await dependencies.reviewService.deleteForAdmin(request.params.id);
      return { success: true as const };
    });
  };
}
