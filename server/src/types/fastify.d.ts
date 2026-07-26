import type { FastifyReply, FastifyRequest } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      kind: 'guest' | 'user';
      type: 'access';
      ver: number;
    };
    user: {
      sub: string;
      kind: 'guest' | 'user';
      type: 'access';
      ver: number;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}
