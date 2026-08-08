import fp from 'fastify-plugin';

export const adminApiCachePlugin = fp(async (app) => {
  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.raw.url?.split('?', 1)[0] ?? '';
    if (path === '/v1/admin' || path.startsWith('/v1/admin/')) {
      reply.header('Cache-Control', 'no-store');
      reply.header('Pragma', 'no-cache');
    }
    return payload;
  });
});
