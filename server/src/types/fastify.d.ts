import type { FastifyReply, FastifyRequest } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      kind: 'guest' | 'user';
      type: 'access' | 'admin' | 'overwolf-live-session' | 'desktop-live-session';
      ver: number;
      analysisId?: string;
      revision?: number;
    };
    user: {
      sub: string;
      kind: 'guest' | 'user';
      type: 'access' | 'admin' | 'overwolf-live-session' | 'desktop-live-session';
      ver: number;
      analysisId?: string;
      revision?: number;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    authenticateAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}
