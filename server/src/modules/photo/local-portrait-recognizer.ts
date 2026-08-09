import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { scheduler } from 'node:timers/promises';
import sharp from 'sharp';
import type { HeroMeta } from '../heroes/heroes.types.js';
import type { PhotoRecognitionResult } from './photo-recognizer.js';
import portraitIndex from './hero-portrait-index.json' with { type: 'json' };
import {
  extractGrayRegion,
  featureNorm,
  grayStandardDeviation,
  normalizedPortraitFeature,
  portraitCoarseTemplatesPerHero,
  portraitDetailedHeroPoolSize,
  portraitFeatureLength,
  portraitQueryHeight,
  portraitQueryWidth,
  portraitSlotHeight,
  portraitSlotWidth,
  resizeImageRegionToGray,
} from './portrait-features.js';
import { portraitCatalogSha256 } from './portrait-catalog.js';
import type { DraftVisionCandidate, DraftVisionInput } from './draft-pick-bar.js';

const slotRatios = [
  0.1331,
  0.2003,
  0.267,
  0.3338,
  0.4005,
  0.599,
  0.6657,
  0.7325,
  0.7993,
  0.866,
] as const;
const queryTopOffsets = [7, 9, 11, 13] as const;
const queryLeftOffsets = [2, 19, 36] as const;
const templates = new Int8Array(gunzipSync(
  Buffer.from(portraitIndex.templatesGzipBase64, 'base64'),
));
const templateNorms = new Float32Array(portraitIndex.templateCount);
const catalogSha256 = portraitCatalogSha256(portraitIndex.heroes);
const portraitSourcesSha256 = createHash('sha256')
  .update(portraitIndex.heroes
    .map((hero) => `${hero.id}:${hero.slug}:${hero.sourceKind}:${hero.sourceSha256}`)
    .join('\n'))
  .digest('hex');
const templatesSha256 = createHash('sha256').update(templates).digest('hex');
const hasValidHeroSpans = portraitIndex.heroes.every((hero, index) => (
  Number.isInteger(hero.start)
  && Number.isInteger(hero.count)
  && hero.start >= 0
  && hero.count > 0
  && /^[a-f0-9]{64}$/.test(hero.sourceSha256)
  && ['qa-cache', 'steam-cdn'].includes(hero.sourceKind)
  && hero.start === (index === 0
    ? 0
    : (portraitIndex.heroes[index - 1]?.start ?? 0)
      + (portraitIndex.heroes[index - 1]?.count ?? 0))
));
const finalHero = portraitIndex.heroes.at(-1);

if (
  portraitIndex.version !== 2
  || portraitIndex.featureLength !== portraitFeatureLength
  || templates.length !== portraitIndex.templateCount * portraitFeatureLength
  || portraitIndex.heroes.length < 120
  || new Set(portraitIndex.heroes.map((hero) => hero.id)).size !== portraitIndex.heroes.length
  || !hasValidHeroSpans
  || (finalHero?.start ?? 0) + (finalHero?.count ?? 0) !== portraitIndex.templateCount
  || portraitIndex.provenance.featureAlgorithm !== 'normalized-grayscale-cosine-v2'
  || portraitIndex.provenance.catalogSha256 !== catalogSha256
  || portraitIndex.provenance.portraitSourcesSha256 !== portraitSourcesSha256
  || portraitIndex.provenance.templatesSha256 !== templatesSha256
  || portraitIndex.provenance.coarseValidation.templatesPerHero
    !== portraitCoarseTemplatesPerHero
  || portraitIndex.provenance.coarseValidation.poolSize !== portraitDetailedHeroPoolSize
  || portraitIndex.provenance.coarseValidation.queryCount !== portraitIndex.templateCount
  || portraitIndex.provenance.coarseValidation.matchedQueryCount !== portraitIndex.templateCount
  || portraitIndex.provenance.coarseValidation.recallAtPool !== 1
  || portraitIndex.provenance.coarseValidation.maxObservedRank
    > portraitIndex.provenance.coarseValidation.poolSize
) {
  throw new Error('The local hero portrait index is incompatible');
}

for (let templateIndex = 0; templateIndex < portraitIndex.templateCount; templateIndex += 1) {
  templateNorms[templateIndex] = featureNorm(templates.subarray(
    templateIndex * portraitFeatureLength,
    (templateIndex + 1) * portraitFeatureLength,
  ));
}

type RawCandidate = {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
};

type PortraitMatch = {
  heroId: number;
  heroName: string;
  score: number;
};

type SlotClassification = {
  slot: number;
  grayDeviation: number;
  top: PortraitMatch;
  second: PortraitMatch;
  margin: number;
  present: boolean;
  strong: boolean;
};

type CandidateInspection = {
  source: DraftVisionCandidate;
  decoded: RawCandidate;
  centerLooksLikeDraft: boolean;
  slots: SlotClassification[];
};

export type LocalPortraitRecognitionOptions = {
  allyGroup?: 'left' | 'right';
  orientationSource?: 'gsi_layout_heuristic' | 'gsi_player_hero' | 'manual_confirmation';
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function eligibleCandidates(input: DraftVisionInput) {
  return input.candidates
    .filter((candidate) => (
      candidate.sourceTopRatio <= 0.85
      && candidate.sourceBottomRatio > candidate.sourceTopRatio
    ))
    .toSorted((left, right) => (
      Number(right.reliability === 'high') - Number(left.reliability === 'high')
      || Number(left.strategy === 'salient_band') - Number(right.strategy === 'salient_band')
      || left.sourceTopRatio - right.sourceTopRatio
      || left.id.localeCompare(right.id)
    ));
}

async function decodeCandidate(candidate: DraftVisionCandidate): Promise<RawCandidate | null> {
  if (candidate.localSource) return candidate.localSource;
  try {
    const decoded = await sharp(candidate.image, {
      failOn: 'error',
      sequentialRead: true,
      animated: false,
    })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      data: decoded.data,
      width: decoded.info.width,
      height: decoded.info.height,
      channels: decoded.info.channels,
    };
  } catch {
    return null;
  }
}

function candidateGeometry(candidate: RawCandidate) {
  const aspectRatio = candidate.width / candidate.height;
  if (aspectRatio < 5) return null;
  const contentWidthRatio = aspectRatio < 7 ? 0.93 : aspectRatio < 10 ? 0.75 : 1;
  const topRatio = aspectRatio < 7 ? 0.03 : 0;
  const contentWidth = candidate.width * contentWidthRatio;
  const contentLeft = (candidate.width - contentWidth) / 2;
  const top = Math.round(candidate.height * topRatio);
  const slotHalfWidth = Math.round(contentWidth * 0.026);
  const slotHeight = Math.min(candidate.height - top, Math.round(contentWidth * 0.0336));
  if (slotHalfWidth < 12 || slotHeight < 24) return null;
  return {
    contentWidth,
    contentLeft,
    top,
    slotHalfWidth,
    slotHeight,
  };
}

function centerLooksLikeDraft(
  candidate: RawCandidate,
  geometry: NonNullable<ReturnType<typeof candidateGeometry>>,
) {
  const left = Math.round(geometry.contentLeft + geometry.contentWidth * 0.45);
  const right = Math.round(geometry.contentLeft + geometry.contentWidth * 0.55);
  const height = geometry.slotHeight;
  let graySum = 0;
  let graySquaredSum = 0;
  let chromaSum = 0;
  let count = 0;
  for (let y = geometry.top; y < geometry.top + height; y += 2) {
    for (let x = left; x < right; x += 2) {
      const offset = (y * candidate.width + x) * candidate.channels;
      const red = candidate.data[offset] ?? 0;
      const green = candidate.data[offset + 1] ?? red;
      const blue = candidate.data[offset + 2] ?? red;
      const gray = red * 0.299 + green * 0.587 + blue * 0.114;
      graySum += gray;
      graySquaredSum += gray * gray;
      chromaSum += Math.max(red, green, blue) - Math.min(red, green, blue);
      count += 1;
    }
  }
  const mean = graySum / Math.max(1, count);
  const deviation = Math.sqrt(Math.max(0, graySquaredSum / Math.max(1, count) - mean * mean));
  const chroma = chromaSum / Math.max(1, count);
  return deviation >= 28 && chroma <= 42 && mean >= 24 && mean <= 150;
}

function featureSimilarity(
  query: Int8Array,
  queryNorm: number,
  templateIndex: number,
) {
  const templateOffset = templateIndex * portraitFeatureLength;
  let dot = 0;
  for (let index = 0; index < portraitFeatureLength; index += 1) {
    dot += (query[index] ?? 0) * (templates[templateOffset + index] ?? 0);
  }
  return dot / Math.max(1, queryNorm * (templateNorms[templateIndex] ?? 0));
}

function classifySlot(
  candidate: RawCandidate,
  geometry: NonNullable<ReturnType<typeof candidateGeometry>>,
  slot: number,
): SlotClassification {
  const center = Math.round(
    geometry.contentLeft + geometry.contentWidth * (slotRatios[slot] ?? 0.5),
  );
  const left = clamp(center - geometry.slotHalfWidth, 0, candidate.width - 1);
  const width = Math.max(
    1,
    Math.min(candidate.width, center + geometry.slotHalfWidth) - left,
  );
  const normalized = resizeImageRegionToGray(
    candidate.data,
    candidate.width,
    candidate.height,
    candidate.channels,
    left,
    geometry.top,
    width,
    geometry.slotHeight,
    portraitSlotWidth,
    portraitSlotHeight,
  );
  const grayDeviation = grayStandardDeviation(
    normalized,
    portraitSlotWidth,
    0,
    10,
    portraitSlotWidth,
    32,
  );
  const emptyMatch: PortraitMatch = { heroId: 0, heroName: '', score: -1 };
  if (grayDeviation < 34) {
    return {
      slot,
      grayDeviation,
      top: emptyMatch,
      second: emptyMatch,
      margin: 0,
      present: false,
      strong: false,
    };
  }
  const queryFeatures = queryTopOffsets.flatMap((top) => (
    queryLeftOffsets.map((queryLeft) => normalizedPortraitFeature(
      extractGrayRegion(
        normalized,
        portraitSlotWidth,
        queryLeft,
        top,
        portraitQueryWidth,
        portraitQueryHeight,
      ),
      portraitQueryWidth,
      portraitQueryHeight,
    ))
  ));
  const queryNorms = queryFeatures.map(featureNorm);
  const coarse = portraitIndex.heroes.map((hero) => {
    let heroScore = -1;
    for (let sample = 0; sample < portraitCoarseTemplatesPerHero; sample += 1) {
      const templateIndex = hero.start + Math.round(
        sample * (hero.count - 1) / (portraitCoarseTemplatesPerHero - 1),
      );
      for (let queryIndex = 0; queryIndex < queryFeatures.length; queryIndex += 1) {
        const query = queryFeatures[queryIndex];
        if (!query) continue;
        const score = featureSimilarity(query, queryNorms[queryIndex] ?? 0, templateIndex);
        if (score > heroScore) heroScore = score;
      }
    }
    return { hero, score: heroScore };
  }).sort((left, right) => right.score - left.score || left.hero.id - right.hero.id);
  const detailed = coarse.slice(0, portraitDetailedHeroPoolSize);
  const bestExcluded = coarse[portraitDetailedHeroPoolSize];
  let top: PortraitMatch = emptyMatch;
  let second: PortraitMatch = emptyMatch;

  for (const { hero } of detailed) {
    let heroScore = -1;
    for (let templateIndex = hero.start; templateIndex < hero.start + hero.count; templateIndex += 1) {
      for (let queryIndex = 0; queryIndex < queryFeatures.length; queryIndex += 1) {
        const query = queryFeatures[queryIndex];
        if (!query) continue;
        const score = featureSimilarity(query, queryNorms[queryIndex] ?? 0, templateIndex);
        if (score > heroScore) heroScore = score;
      }
    }
    const match = { heroId: hero.id, heroName: hero.name, score: heroScore };
    if (match.score > top.score) {
      second = top;
      top = match;
    } else if (match.score > second.score) {
      second = match;
    }
  }
  if (bestExcluded && bestExcluded.score > second.score) {
    second = {
      heroId: bestExcluded.hero.id,
      heroName: bestExcluded.hero.name,
      score: bestExcluded.score,
    };
  }

  const margin = top.score - second.score;
  const present = top.score >= 0.68
    && grayDeviation >= 34
    && (margin >= 0.055 || grayDeviation >= 48);
  const strong = present && (
    (top.score >= 0.7 && margin >= 0.065)
    || (top.score >= 0.9 && margin >= 0.018 && grayDeviation >= 52)
  );
  return {
    slot,
    grayDeviation,
    top,
    second,
    margin,
    present,
    strong,
  };
}

async function inspectCandidate(
  source: DraftVisionCandidate,
): Promise<CandidateInspection | null> {
  const decoded = await decodeCandidate(source);
  if (!decoded) return null;
  const geometry = candidateGeometry(decoded);
  if (!geometry) return null;
  const draftCenter = centerLooksLikeDraft(decoded, geometry);
  if (!draftCenter) {
    return {
      source,
      decoded,
      centerLooksLikeDraft: false,
      slots: [],
    };
  }
  const slots: SlotClassification[] = [];
  for (let slot = 0; slot < slotRatios.length; slot += 1) {
    if (slot > 0) await scheduler.yield();
    slots.push(classifySlot(decoded, geometry, slot));
  }
  return {
    source,
    decoded,
    centerLooksLikeDraft: true,
    slots,
  };
}

async function inspectCandidates(input: DraftVisionInput) {
  const inspected: CandidateInspection[] = [];
  for (const source of eligibleCandidates(input)) {
    const candidate = await inspectCandidate(source);
    if (candidate) inspected.push(candidate);
  }
  return inspected;
}

function inspectionScore(inspection: CandidateInspection) {
  const present = inspection.slots.filter((entry) => entry.present);
  const strong = present.filter((entry) => entry.strong);
  const margin = strong.reduce((sum, entry) => sum + entry.margin, 0)
    / Math.max(1, strong.length);
  return Number(inspection.centerLooksLikeDraft) * 10_000
    + strong.length * 100
    + present.length * 10
    + margin;
}

function toPublicInspection(inspection: CandidateInspection) {
  return {
    candidate: {
      id: inspection.source.id,
      strategy: inspection.source.strategy,
      reliability: inspection.source.reliability,
      enhanced: inspection.source.enhanced,
      width: inspection.decoded.width,
      height: inspection.decoded.height,
    },
    centerLooksLikeDraft: inspection.centerLooksLikeDraft,
    slots: inspection.slots,
  };
}

export async function inspectDraftPortraits(input: DraftVisionInput) {
  const inspected = await inspectCandidates(input);
  const selected = inspected.toSorted((left, right) => (
    inspectionScore(right) - inspectionScore(left)
    || left.source.id.localeCompare(right.source.id)
  ))[0];
  return selected ? toPublicInspection(selected) : null;
}

function matchConfidence(entry: SlotClassification, trustedLayout: boolean) {
  const similarityStrength = clamp((entry.top.score - 0.65) / 0.35, 0, 1);
  const marginStrength = clamp((entry.margin - 0.018) / 0.12, 0, 1);
  const score = 0.54
    + similarityStrength * 0.22
    + marginStrength * 0.14
    + Number(trustedLayout) * 0.03;
  return Math.round(clamp(score, 0.54, 0.93) * 1_000) / 1_000;
}

export async function recognizeDraftWithPortraitIndex(
  input: DraftVisionInput,
  heroes: HeroMeta[],
  options: LocalPortraitRecognitionOptions = {},
): Promise<PhotoRecognitionResult | null> {
  const heroById = new Map(heroes.map((hero) => [hero.id, hero]));
  const inspected = await inspectCandidates(input);
  const eligible = inspected.filter((inspection) => {
    if (!inspection.centerLooksLikeDraft) return false;
    const present = inspection.slots.filter((entry) => entry.present);
    const hasUnresolvedOccupiedSlot = inspection.slots.some(
      (entry) => !entry.present && entry.grayDeviation >= 48,
    );
    if (
      present.length < 2
      || present.some((entry) => !entry.strong)
      || hasUnresolvedOccupiedSlot
    ) return false;
    const heroIds = present.map((entry) => entry.top.heroId);
    return new Set(heroIds).size === heroIds.length
      && heroIds.every((heroId) => heroById.has(heroId));
  });
  const selected = eligible.toSorted((left, right) => (
    Number(right.source.reliability === 'high' && !right.source.enhanced)
      - Number(left.source.reliability === 'high' && !left.source.enhanced)
    || inspectionScore(right) - inspectionScore(left)
    || left.source.id.localeCompare(right.source.id)
  ))[0];
  if (!selected) return null;
  const present = selected.slots.filter((entry) => entry.present);

  const trustedLayout = selected.source.reliability === 'high' && !selected.source.enhanced;
  const hasTeamOrientation = options.allyGroup !== undefined;
  const recognized = present.map((entry) => {
    const hero = heroById.get(entry.top.heroId);
    if (!hero) throw new Error('The local portrait index and hero catalog are inconsistent');
    const visualGroup: 'left' | 'right' = entry.slot < 5 ? 'left' : 'right';
    const side = options.allyGroup === undefined
      ? 'unknown' as const
      : visualGroup === options.allyGroup
        ? 'ally' as const
        : 'enemy' as const;
    return {
      side,
      visualGroup,
      slot: entry.slot % 5,
      heroId: hero.id,
      heroName: hero.localizedName,
      localizedName: hero.localizedName,
      confidence: matchConfidence(entry, trustedLayout),
      needsReview: !trustedLayout || !hasTeamOrientation,
    };
  });

  return {
    quality: trustedLayout && hasTeamOrientation ? 'clear' : 'partial',
    ...(hasTeamOrientation
      ? { orientationSource: options.orientationSource ?? 'explicit_signal' as const }
      : {}),
    detectedPosition: null,
    recognized,
    model: `local-portrait-index-v${portraitIndex.version}-match-score`,
  };
}
