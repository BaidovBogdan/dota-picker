import { createHash } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = process.env.DOTA_GSI_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.DOTA_GSI_PORT || '32123', 10);
const expectedToken = process.env.DOTA_GSI_TOKEN || 'counterpick-local-probe';
const maxBodyBytes = 1024 * 1024;
const sourceDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(sourceDir, '..', 'output');
const startedAt = new Date().toISOString();
const sessionId = startedAt.replaceAll(':', '-').replaceAll('.', '-');
const captureFile = resolve(outputDir, `gsi-${sessionId}.ndjson`);
const latestFile = resolve(outputDir, 'latest.json');
const statusFile = resolve(outputDir, 'status.json');
const pathsFile = resolve(outputDir, 'discovered-paths.json');
const observationsFile = resolve(outputDir, `observations-${sessionId}.ndjson`);

await mkdir(outputDir, { recursive: true });

let receivedRequests = 0;
let validRequests = 0;
let savedPayloads = 0;
let duplicatePayloads = 0;
let lastReceivedAt = null;
let lastHash = null;
let lastTopLevelKeys = [];
let lastObservation = null;
let writeQueue = Promise.resolve();
const discoveredPaths = new Set();

function respond(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let totalBytes = 0;
    let tooLarge = false;

    request.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBodyBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (tooLarge) {
        rejectBody(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      resolveBody(Buffer.concat(chunks).toString('utf8'));
    });

    request.on('error', rejectBody);
  });
}

function sanitizePayload(payload) {
  if (!payload.auth) return payload;
  return {
    ...payload,
    auth: {
      ...payload.auth,
      token: '[redacted]',
    },
  };
}

function collectPaths(value, prefix = '') {
  if (Array.isArray(value)) {
    if (prefix) discoveredPaths.add(`${prefix}[]`);
    for (const item of value) collectPaths(item, `${prefix}[]`);
    return;
  }

  if (!value || typeof value !== 'object') {
    if (prefix) discoveredPaths.add(prefix);
    return;
  }

  if (prefix) discoveredPaths.add(prefix);
  for (const [key, child] of Object.entries(value)) {
    collectPaths(child, prefix ? `${prefix}.${key}` : key);
  }
}

function objectKeys(value) {
  return value && typeof value === 'object' ? Object.keys(value).sort() : [];
}

function countEntries(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function createObservation(payload, receivedAt) {
  return {
    receivedAt,
    topLevelKeys: Object.keys(payload).sort(),
    gameState: payload.map?.game_state ?? null,
    activity: payload.player?.activity ?? null,
    localHero: payload.hero?.name ?? null,
    draftPresent: Boolean(payload.draft),
    draftKeys: objectKeys(payload.draft),
    draft: payload.draft ?? null,
    allPlayersPresent: Boolean(payload.allplayers),
    allPlayersCount: countEntries(payload.allplayers),
    allPlayersKeys: objectKeys(payload.allplayers),
    eventsCount: countEntries(payload.events),
  };
}

function createStatus() {
  return {
    running: true,
    host,
    port,
    startedAt,
    receivedRequests,
    validRequests,
    savedPayloads,
    duplicatePayloads,
    lastReceivedAt,
    lastTopLevelKeys,
    discoveredPathCount: discoveredPaths.size,
    lastObservation,
    captureFile,
  };
}

function persistPayload(payload, receivedAt) {
  collectPaths(payload);
  lastTopLevelKeys = Object.keys(payload).sort();
  const observation = createObservation(payload, receivedAt);
  lastObservation = observation;
  const serialized = JSON.stringify(payload);
  const hash = createHash('sha256').update(serialized).digest('hex');
  const isDuplicate = hash === lastHash;
  lastHash = hash;

  if (isDuplicate) duplicatePayloads += 1;
  else savedPayloads += 1;

  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    if (!isDuplicate) {
      await appendFile(
        captureFile,
        `${JSON.stringify({ receivedAt, payload })}\n`,
        'utf8',
      );
      await appendFile(observationsFile, `${JSON.stringify(observation)}\n`, 'utf8');
      await writeFile(latestFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    }

    await writeFile(
      pathsFile,
      `${JSON.stringify([...discoveredPaths].sort(), null, 2)}\n`,
      'utf8',
    );
    await writeFile(statusFile, `${JSON.stringify(createStatus(), null, 2)}\n`, 'utf8');
  });

  return { saved: !isDuplicate, observation };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`);

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    respond(response, 200, createStatus());
    return;
  }

  if (request.method !== 'POST' || url.pathname !== '/gsi') {
    respond(response, 404, { ok: false, error: 'NOT_FOUND' });
    return;
  }

  receivedRequests += 1;

  try {
    const rawBody = await readRequestBody(request);
    const parsed = JSON.parse(rawBody);

    if (parsed?.auth?.token !== expectedToken) {
      respond(response, 401, { ok: false, error: 'INVALID_TOKEN' });
      return;
    }

    validRequests += 1;
    lastReceivedAt = new Date().toISOString();
    const sanitized = sanitizePayload(parsed);
    const result = persistPayload(sanitized, lastReceivedAt);
    respond(response, 200, {
      ok: true,
      request: validRequests,
      saved: result.saved,
      observation: result.observation,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE') {
      respond(response, 413, { ok: false, error: 'PAYLOAD_TOO_LARGE' });
      return;
    }
    respond(response, 400, { ok: false, error: 'INVALID_JSON' });
  }
});

server.listen(port, host, async () => {
  await writeFile(statusFile, `${JSON.stringify(createStatus(), null, 2)}\n`, 'utf8');
  process.stdout.write(`Dota GSI probe: http://${host}:${port}/gsi\n`);
  process.stdout.write(`Captures: ${captureFile}\n`);
});

async function shutdown() {
  server.close(async () => {
    await writeQueue;
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
