import fastifyStatic from '@fastify/static';
import { access } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

const adminContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
].join('; ');

export const adminStaticPlugin: FastifyPluginAsync = async (app) => {
  const root = process.env.ADMIN_DIST_DIR
    ? path.resolve(process.env.ADMIN_DIST_DIR)
    : path.resolve(process.cwd(), 'admin');

  try {
    await access(path.join(root, 'index.html'));
  } catch {
    return;
  }

  await app.register(fastifyStatic, {
    root,
    serve: false,
    decorateReply: true,
  });

  app.get('/admin', async (_request, reply) => reply.redirect('/admin/', 308));

  app.get('/admin/assets/*', async (request, reply) => {
    const asset = (request.params as { '*': string })['*'];
    return reply
      .sendFile(`assets/${asset}`, { maxAge: '365d', immutable: true });
  });

  const sendAdminShell = async (_request: FastifyRequest, reply: FastifyReply) => reply
    .header('Cache-Control', 'no-store')
    .header('Content-Security-Policy', adminContentSecurityPolicy)
    .sendFile('index.html', { cacheControl: false });

  app.get('/admin/', sendAdminShell);
  app.get('/admin/*', sendAdminShell);
};
