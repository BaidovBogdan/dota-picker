import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  extractGrayRegion,
  featureNorm,
  normalizedPortraitFeature,
  portraitCoarseTemplatesPerHero,
  portraitDetailedHeroPoolSize,
  portraitFeatureHeight,
  portraitFeatureLength,
  portraitFeatureWidth,
  portraitQueryHeight,
  portraitQueryWidth,
  resizeImageRegionToGray,
} from '../src/modules/photo/portrait-features.js';
import {
  normalizePortraitCatalog,
  portraitCatalogSha256,
} from '../src/modules/photo/portrait-catalog.js';

type HeroManifest = {
  heroes: {
    id: number;
    slug: string;
    name: string;
  }[];
};

type ExistingIndex = {
  heroes: HeroManifest['heroes'];
};

type CatalogResolution = {
  manifest: HeroManifest;
  catalogSource: string;
  catalogSourceKind: 'opendota' | 'existing-index' | 'qa-manifest';
};

type OpenDotaHero = {
  id: number;
  name: string;
  localized_name: string;
};

const serverRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const assetRoot = join(
  serverRoot,
  '..',
  'qa-artifacts',
  'android-2026-07-28',
  'local-hero-classifier',
  'hero-assets',
);
const outputPath = join(
  serverRoot,
  'src',
  'modules',
  'photo',
  'hero-portrait-index.json',
);
const generatorPath = fileURLToPath(import.meta.url);
const featureSourcePath = join(
  serverRoot,
  'src',
  'modules',
  'photo',
  'portrait-features.ts',
);
const manifestPath = join(assetRoot, 'manifest.json');
const maxCatalogBytes = 1_000_000;
const maxExistingIndexBytes = 2_000_000;
const maxPortraitBytes = 3_000_000;
const maxPortraitPixels = 1_048_576;
const catalogUrl = 'https://api.opendota.com/api/constants/heroes';

async function fetchBounded(url: string, maxBytes: number, label: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Unable to fetch ${label}`);
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`${label} exceeds the byte limit`);
  }
  if (!response.body) throw new Error(`${label} response has no body`);
  const chunks: Uint8Array[] = [];
  let received = 0;
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    received += chunk.byteLength;
    if (received > maxBytes) {
      throw new Error(`${label} exceeds the byte limit`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, received);
}

function isMissingFile(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT';
}

async function readOptionalBoundedFile(path: string, maxBytes: number, label: string) {
  let metadata;
  try {
    metadata = await stat(path);
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
  if (metadata.size > maxBytes) throw new Error(`${label} exceeds the byte limit`);
  return readFile(path);
}

async function resolveManifest(): Promise<CatalogResolution> {
  let remoteFailure: unknown;
  try {
    const body = await fetchBounded(catalogUrl, maxCatalogBytes, 'the current hero catalog');
    const catalog = JSON.parse(body.toString('utf8')) as Record<string, OpenDotaHero>;
    const heroes = Object.values(catalog)
      .filter((hero) => hero.id > 0 && hero.name.startsWith('npc_dota_hero_'))
      .map((hero) => ({
        id: hero.id,
        slug: hero.name.slice('npc_dota_hero_'.length),
        name: hero.localized_name,
      }))
      .sort((left, right) => left.id - right.id);
    if (heroes.length < 120) throw new Error('The current hero catalog is incomplete');
    return {
      manifest: { heroes },
      catalogSource: catalogUrl,
      catalogSourceKind: 'opendota',
    };
  } catch (error) {
    remoteFailure = error;
  }
  const existingBytes = await readOptionalBoundedFile(
    outputPath,
    maxExistingIndexBytes,
    'the existing portrait index',
  );
  if (existingBytes) {
    const existing = JSON.parse(existingBytes.toString('utf8')) as ExistingIndex;
    return {
      manifest: { heroes: normalizePortraitCatalog(existing.heroes) },
      catalogSource: 'src/modules/photo/hero-portrait-index.json',
      catalogSourceKind: 'existing-index',
    };
  }
  const qaManifestBytes = await readOptionalBoundedFile(
    manifestPath,
    maxCatalogBytes,
    'the QA hero manifest',
  );
  if (qaManifestBytes) {
    return {
      manifest: JSON.parse(qaManifestBytes.toString('utf8')) as HeroManifest,
      catalogSource: '../qa-artifacts/android-2026-07-28/local-hero-classifier/hero-assets/manifest.json',
      catalogSourceKind: 'qa-manifest',
    };
  }
  throw remoteFailure;
}

const {
  manifest,
  catalogSource,
  catalogSourceKind,
} = await resolveManifest();
const scales = [0.5, 0.53, 0.56];
const templates: Int8Array[] = [];
const heroes: {
  id: number;
  name: string;
  slug: string;
  start: number;
  count: number;
  sourceSha256: string;
  sourceKind: 'qa-cache' | 'steam-cdn';
}[] = [];

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

function validateManifest(value: HeroManifest) {
  if (value.heroes.length < 120) throw new Error('The current hero catalog is incomplete');
  const ids = new Set<number>();
  const slugs = new Set<string>();
  let previousId = 0;
  for (const hero of value.heroes) {
    if (!Number.isInteger(hero.id) || hero.id <= 0) throw new Error('Invalid hero id');
    if (hero.id <= previousId) throw new Error('Hero catalog must be sorted by id');
    if (!/^[a-z0-9_]+$/.test(hero.slug)) throw new Error(`Invalid hero slug: ${hero.slug}`);
    if (!hero.name.trim()) throw new Error(`Missing hero name: ${hero.slug}`);
    if (ids.has(hero.id) || slugs.has(hero.slug)) throw new Error('Duplicate hero catalog entry');
    ids.add(hero.id);
    slugs.add(hero.slug);
    previousId = hero.id;
  }
}

validateManifest(manifest);

async function heroAsset(slug: string) {
  const localPath = join(assetRoot, `${slug}.png`);
  const local = await readOptionalBoundedFile(
    localPath,
    maxPortraitBytes,
    `local portrait for ${slug}`,
  );
  if (local) return { bytes: local, sourceKind: 'qa-cache' as const };
  const bytes = await fetchBounded(
    `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`,
    maxPortraitBytes,
    `portrait for ${slug}`,
  );
  return { bytes, sourceKind: 'steam-cdn' as const };
}

for (const hero of manifest.heroes) {
  const start = templates.length;
  const { bytes: asset, sourceKind } = await heroAsset(hero.slug);
  const sourceSha256 = sha256(asset);
  const portrait = sharp(asset, {
    failOn: 'error',
    limitInputPixels: maxPortraitPixels,
    sequentialRead: true,
    animated: false,
  });
  const assetMetadata = await portrait.metadata();
  if (
    !assetMetadata.width
    || !assetMetadata.height
    || (assetMetadata.pages ?? 1) !== 1
    || assetMetadata.width < 128
    || assetMetadata.height < 72
    || assetMetadata.width > 1_024
    || assetMetadata.height > 1_024
    || assetMetadata.width / assetMetadata.height < 1
    || assetMetadata.width / assetMetadata.height > 3
  ) {
    throw new Error(`Portrait dimensions are invalid for ${hero.slug}`);
  }
  const source = await portrait
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (const scale of scales) {
    const width = Math.round(256 * scale);
    const height = Math.round(144 * scale);
    const resized = resizeImageRegionToGray(
      source.data,
      source.info.width,
      source.info.height,
      source.info.channels,
      0,
      0,
      source.info.width,
      source.info.height,
      width,
      height,
    );
    for (let left = 0; left <= width - portraitQueryWidth; left += 4) {
      templates.push(normalizedPortraitFeature(
        extractGrayRegion(
          resized,
          width,
          left,
          0,
          portraitQueryWidth,
          portraitQueryHeight,
        ),
        portraitQueryWidth,
        portraitQueryHeight,
      ));
    }
  }
  heroes.push({
    id: hero.id,
    name: hero.name,
    slug: hero.slug,
    start,
    count: templates.length - start,
    sourceSha256,
    sourceKind,
  });
}

const templateNorms = templates.map(featureNorm);

function templateSimilarity(queryIndex: number, candidateIndex: number) {
  const query = templates[queryIndex];
  const candidate = templates[candidateIndex];
  if (!query || !candidate) return -1;
  let dot = 0;
  for (let index = 0; index < portraitFeatureLength; index += 1) {
    dot += (query[index] ?? 0) * (candidate[index] ?? 0);
  }
  return dot / Math.max(1, (templateNorms[queryIndex] ?? 0) * (templateNorms[candidateIndex] ?? 0));
}

function validateCoarseShortlist() {
  let queryCount = 0;
  let matchedQueryCount = 0;
  let maxObservedRank = 0;
  for (const sourceHero of heroes) {
    for (let queryOffset = 0; queryOffset < sourceHero.count; queryOffset += 1) {
      queryCount += 1;
      const queryIndex = sourceHero.start + queryOffset;
      const ranked = heroes.map((candidateHero) => {
        let score = -1;
        for (let sample = 0; sample < portraitCoarseTemplatesPerHero; sample += 1) {
          const candidateIndex = candidateHero.start + Math.round(
            sample * (candidateHero.count - 1) / (portraitCoarseTemplatesPerHero - 1),
          );
          score = Math.max(score, templateSimilarity(queryIndex, candidateIndex));
        }
        return { heroId: candidateHero.id, score };
      }).sort((left, right) => right.score - left.score || left.heroId - right.heroId);
      const rank = ranked.findIndex((candidate) => candidate.heroId === sourceHero.id) + 1;
      if (rank <= 0 || rank > portraitDetailedHeroPoolSize) {
        throw new Error(`Coarse shortlist excluded ${sourceHero.slug} at rank ${rank}`);
      }
      matchedQueryCount += 1;
      maxObservedRank = Math.max(maxObservedRank, rank);
    }
  }
  const queriesPerHero = heroes[0]?.count ?? 0;
  if (heroes.some((hero) => hero.count !== queriesPerHero)) {
    throw new Error('Coarse validation requires a uniform template corpus');
  }
  return {
    queriesPerHero,
    queryCount,
    matchedQueryCount,
    recallAtPool: matchedQueryCount / Math.max(1, queryCount),
    templatesPerHero: portraitCoarseTemplatesPerHero,
    poolSize: portraitDetailedHeroPoolSize,
    maxObservedRank,
  };
}

const coarseValidation = validateCoarseShortlist();

const bytes = new Int8Array(templates.length * portraitFeatureLength);
for (let index = 0; index < templates.length; index += 1) {
  bytes.set(templates[index] ?? [], index * portraitFeatureLength);
}
const compressed = gzipSync(bytes, { level: 9 });
const catalogSha256 = portraitCatalogSha256(manifest.heroes);
const portraitSourcesSha256 = sha256(heroes
  .map((hero) => `${hero.id}:${hero.slug}:${hero.sourceKind}:${hero.sourceSha256}`)
  .join('\n'));
const templatesSha256 = sha256(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
const output = {
  version: 2,
  featureWidth: portraitFeatureWidth,
  featureHeight: portraitFeatureHeight,
  featureLength: portraitFeatureLength,
  templateCount: templates.length,
  provenance: {
    generator: 'scripts/generate-portrait-index.ts',
    generatorSha256: sha256(await readFile(generatorPath)),
    featureSource: 'src/modules/photo/portrait-features.ts',
    featureSourceSha256: sha256(await readFile(featureSourcePath)),
    catalogSource,
    catalogSourceKind,
    portraitCacheSource: '../qa-artifacts/android-2026-07-28/local-hero-classifier/hero-assets/{slug}.png',
    portraitSourceTemplate: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{slug}.png',
    catalogSha256,
    portraitSourcesSha256,
    templatesSha256,
    generatedAt: null,
    timestampPolicy: 'omitted-for-reproducible-builds',
    featureAlgorithm: 'normalized-grayscale-cosine-v2',
    coarseValidation,
  },
  heroes,
  templatesGzipBase64: compressed.toString('base64'),
};

if (
  output.heroes[0]?.start !== 0
  || output.heroes.some((hero, index) => (
    hero.count <= 0
    || !/^[a-f0-9]{64}$/.test(hero.sourceSha256)
    || !['qa-cache', 'steam-cdn'].includes(hero.sourceKind)
    || (index > 0 && hero.start !== (
      (output.heroes[index - 1]?.start ?? 0) + (output.heroes[index - 1]?.count ?? 0)
    ))
  ))
  || (output.heroes.at(-1)?.start ?? 0) + (output.heroes.at(-1)?.count ?? 0)
    !== output.templateCount
  || !/^[a-f0-9]{64}$/.test(output.provenance.catalogSha256)
  || !/^[a-f0-9]{64}$/.test(output.provenance.portraitSourcesSha256)
  || output.provenance.templatesSha256 !== sha256(gunzipSync(compressed))
  || output.provenance.coarseValidation.queryCount !== output.templateCount
  || output.provenance.coarseValidation.matchedQueryCount !== output.templateCount
  || output.provenance.coarseValidation.recallAtPool !== 1
  || output.provenance.coarseValidation.maxObservedRank
    > output.provenance.coarseValidation.poolSize
  || !gunzipSync(compressed).equals(Buffer.from(bytes.buffer))
) {
  throw new Error('Generated portrait index failed deterministic validation');
}

const serialized = `${JSON.stringify(output)}\n`;
const temporaryOutputPath = `${outputPath}.${process.pid}.tmp`;
try {
  await writeFile(temporaryOutputPath, serialized, 'utf8');
  await rename(temporaryOutputPath, outputPath);
} finally {
  await unlink(temporaryOutputPath).catch(() => undefined);
}
process.stdout.write(`${JSON.stringify({
  outputPath,
  heroCount: heroes.length,
  templateCount: templates.length,
  rawBytes: bytes.byteLength,
  compressedBytes: compressed.byteLength,
  catalogSha256,
  portraitSourcesSha256,
  templatesSha256,
  catalogSource,
  catalogSourceKind,
  coarseValidation,
  outputSha256: sha256(serialized),
})}\n`);
