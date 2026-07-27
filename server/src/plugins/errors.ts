import fp from 'fastify-plugin';
import { AppError } from '../lib/errors.js';

export const errorPlugin = fp(async (app) => {
  app.setNotFoundHandler((request, reply) => reply.status(404).send({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
      requestId: request.id,
    },
  }));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
          requestId: request.id,
        },
      });
    }

    if (typeof error === 'object' && error !== null && 'validation' in error && error.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.validation,
          requestId: request.id,
        },
      });
    }

    if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 400) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body is invalid',
          requestId: request.id,
        },
      });
    }

    if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 413) {
      return reply.status(413).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request payload is too large',
          requestId: request.id,
        },
      });
    }

    if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests; retry shortly',
          requestId: request.id,
        },
      });
    }

    request.log.error({ err: error }, 'Unhandled request error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId: request.id,
      },
    });
  });
});
