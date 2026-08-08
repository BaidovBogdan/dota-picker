import Fastify, { type FastifyInstance } from 'fastify';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminStaticPlugin } from '../src/plugins/admin-static.js';

const openApps: FastifyInstance[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map(async (app) => app.close()));
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => {
    await rm(directory, { force: true, recursive: true });
  }));
  vi.unstubAllEnvs();
});

describe('admin static shell', () => {
  it('allows only the exact hero image CDN origin in its image policy', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dota-picker-admin-'));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>');
    vi.stubEnv('ADMIN_DIST_DIR', root);

    const app = Fastify({ logger: false });
    openApps.push(app);
    await app.register(adminStaticPlugin);

    const response = await app.inject({ method: 'GET', url: '/admin/meta' });
    const policy = response.headers['content-security-policy'];
    const imageDirective = policy
      ?.split('; ')
      .find((directive) => directive.startsWith('img-src '));

    expect(response.statusCode).toBe(200);
    expect(imageDirective).toBe("img-src 'self' data: https://cdn.cloudflare.steamstatic.com");
  });
});
