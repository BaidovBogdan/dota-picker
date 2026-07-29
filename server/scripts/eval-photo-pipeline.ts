import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const artifactRoot = join(projectRoot, 'qa-artifacts', 'android-2026-07-28');
const inputRoot = join(artifactRoot, 'input-images');
const generatedRoot = join(artifactRoot, 'generated-photo-eval');
const resultPath = join(artifactRoot, 'photo-pipeline-v2-results.json');
const baseUrl = process.env.QA_API_URL ?? 'http://127.0.0.1:4000/v1';
const email = process.env.QA_EMAIL;
const password = process.env.QA_PASSWORD;
const requestedCases = new Set(
  (process.env.PHOTO_EVAL_CASES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const expectedHeroes = new Set([
  'Earth Spirit',
  'Invoker',
  'Monkey King',
  'Disruptor',
  'Death Prophet',
]);

if (!email || !password) {
  throw new Error('QA_EMAIL and QA_PASSWORD are required');
}

async function postJson(path: string, body: unknown, token?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  return payload as Record<string, unknown>;
}

async function createCorpus() {
  await mkdir(generatedRoot, { recursive: true });
  const full = await readFile(join(inputRoot, 'user-full-draft.png'));
  const narrow = await readFile(join(inputRoot, 'user-narrow-pick-bar.png'));
  const dark = await sharp(full)
    .modulate({ brightness: 0.36, saturation: 0.78 })
    .jpeg({ quality: 52 })
    .toBuffer();
  const lowQuality = await sharp(full)
    .resize({ width: 900 })
    .blur(1.35)
    .jpeg({ quality: 28 })
    .toBuffer();
  const monitor = await sharp(full)
    .resize({ width: 1_800 })
    .jpeg({ quality: 78 })
    .toBuffer({ resolveWithObject: true });
  const letterboxed = await sharp({
    create: {
      width: 2_400,
      height: 1_600,
      channels: 3,
      background: '#080A0D',
    },
  })
    .composite([{
      input: monitor.data,
      left: 300,
      top: 220,
    }])
    .jpeg({ quality: 78 })
    .toBuffer();
  const portraitMonitor = await sharp(full)
    .resize({ width: 1_000 })
    .jpeg({ quality: 72 })
    .toBuffer({ resolveWithObject: true });
  const portrait = await sharp({
    create: {
      width: 1_080,
      height: 1_920,
      channels: 3,
      background: '#302E2A',
    },
  })
    .composite([{
      input: portraitMonitor.data,
      left: 40,
      top: 420,
    }])
    .jpeg({ quality: 68 })
    .toBuffer();
  const glareOverlay = await sharp({
    create: {
      width: monitor.info.width,
      height: monitor.info.height,
      channels: 4,
      background: { r: 255, g: 244, b: 219, alpha: 0.22 },
    },
  }).png().toBuffer();
  const daylight = await sharp(monitor.data)
    .composite([{
      input: glareOverlay,
      blend: 'screen',
    }])
    .jpeg({ quality: 72 })
    .toBuffer();
  const corpus = [
    { name: 'user-narrow', bytes: narrow, mimeType: 'image/png' },
    { name: 'user-full', bytes: full, mimeType: 'image/png' },
    { name: 'dark-monitor', bytes: dark, mimeType: 'image/jpeg' },
    { name: 'blurred-low-quality', bytes: lowQuality, mimeType: 'image/jpeg' },
    { name: 'letterboxed-monitor', bytes: letterboxed, mimeType: 'image/jpeg' },
    { name: 'portrait-monitor', bytes: portrait, mimeType: 'image/jpeg' },
    { name: 'daylight-glare', bytes: daylight, mimeType: 'image/jpeg' },
  ];

  for (const entry of corpus) {
    await writeFile(
      join(generatedRoot, `${entry.name}.${entry.mimeType === 'image/png' ? 'png' : 'jpg'}`),
      entry.bytes,
    );
  }

  return requestedCases.size > 0
    ? corpus.filter((entry) => requestedCases.has(entry.name))
    : corpus;
}

const challenge = await postJson('/auth/otp/request', {
  purpose: 'login',
  email,
  password,
});
const login = await postJson('/auth/login', {
  email,
  password,
  challengeId: challenge.challengeId,
  code: '1234',
});
if (typeof login.accessToken !== 'string') {
  throw new Error('Login response did not contain an access token');
}
const accessToken = login.accessToken;
const corpus = await createCorpus();
const cases = [];

for (const entry of corpus) {
  const startedAt = performance.now();
  const form = new FormData();
  form.append(
    'image',
    new Blob([entry.bytes], { type: entry.mimeType }),
    `${entry.name}.${entry.mimeType === 'image/png' ? 'png' : 'jpg'}`,
  );
  const response = await fetch(`${baseUrl}/analyses/photo/recognize`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'idempotency-key': randomUUID(),
    },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json() as {
    code?: string;
    message?: string;
    quality?: string;
    model?: string;
    recognized?: {
      side: 'ally' | 'enemy' | 'unknown';
      slot: number;
      heroId: number | null;
      heroName: string;
      localizedName: string | null;
      confidence: number;
      needsReview: boolean;
    }[];
  };
  const predicted = new Set(
    (payload.recognized ?? []).map((pick) => pick.localizedName ?? pick.heroName),
  );
  const truePositives = [...predicted].filter((name) => expectedHeroes.has(name)).length;
  const falsePositives = [...predicted].filter((name) => !expectedHeroes.has(name)).length;
  const falseNegatives = [...expectedHeroes].filter((name) => !predicted.has(name)).length;
  const precision = truePositives + falsePositives > 0
    ? truePositives / (truePositives + falsePositives)
    : null;
  const recall = truePositives / expectedHeroes.size;
  const f1 = precision !== null && precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;

  cases.push({
    name: entry.name,
    status: response.status,
    durationMs: Math.round(performance.now() - startedAt),
    error: response.ok
      ? null
      : {
          code: payload.code ?? null,
          message: payload.message ?? null,
        },
    quality: payload.quality ?? null,
    model: payload.model ?? null,
    recognized: payload.recognized ?? [],
    predicted: [...predicted],
    expected: [...expectedHeroes],
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1,
  });
}

const successfulCases = cases.filter((entry) => entry.status === 200);
const totalTruePositives = successfulCases.reduce((sum, entry) => sum + entry.truePositives, 0);
const totalFalsePositives = successfulCases.reduce((sum, entry) => sum + entry.falsePositives, 0);
const totalFalseNegatives = successfulCases.reduce((sum, entry) => sum + entry.falseNegatives, 0);
const aggregatePrecision = totalTruePositives + totalFalsePositives > 0
  ? totalTruePositives / (totalTruePositives + totalFalsePositives)
  : null;
const aggregateRecall = totalTruePositives / Math.max(
  1,
  totalTruePositives + totalFalseNegatives,
);
const aggregateF1 = aggregatePrecision !== null && aggregatePrecision + aggregateRecall > 0
  ? (2 * aggregatePrecision * aggregateRecall) / (aggregatePrecision + aggregateRecall)
  : 0;
const totalAttemptTruePositives = cases.reduce((sum, entry) => sum + entry.truePositives, 0);
const totalAttemptFalsePositives = cases.reduce((sum, entry) => sum + entry.falsePositives, 0);
const totalAttemptFalseNegatives = cases.reduce((sum, entry) => sum + entry.falseNegatives, 0);
const endToEndPrecision = totalAttemptTruePositives + totalAttemptFalsePositives > 0
  ? totalAttemptTruePositives / (totalAttemptTruePositives + totalAttemptFalsePositives)
  : null;
const endToEndRecall = totalAttemptTruePositives / Math.max(
  1,
  totalAttemptTruePositives + totalAttemptFalseNegatives,
);
const endToEndF1 = endToEndPrecision !== null && endToEndPrecision + endToEndRecall > 0
  ? (2 * endToEndPrecision * endToEndRecall) / (endToEndPrecision + endToEndRecall)
  : 0;
const result = {
  generatedAt: new Date().toISOString(),
  provider: 'configured backend photo recognizer',
  expectedSidePolicy: 'hero-set accuracy only; ally/enemy is intentionally ignored when the screenshot has no unambiguous local-player marker',
  aggregate: {
    cases: cases.length,
    successfulCases: successfulCases.length,
    failedCases: cases.length - successfulCases.length,
    precision: aggregatePrecision,
    recall: aggregateRecall,
    f1: aggregateF1,
    averageLatencyMs: successfulCases.length > 0
      ? Math.round(
        successfulCases.reduce((sum, entry) => sum + entry.durationMs, 0)
        / successfulCases.length,
      )
      : null,
    endToEndPrecision,
    endToEndRecall,
    endToEndF1,
    averageAttemptLatencyMs: cases.length > 0
      ? Math.round(
        cases.reduce((sum, entry) => sum + entry.durationMs, 0)
        / cases.length,
      )
      : null,
  },
  cases,
};

await mkdir(dirname(resultPath), { recursive: true });
await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
