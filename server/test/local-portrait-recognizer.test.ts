import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { createDesktopDraft } from '../src/modules/analysis/desktop-analysis.js';
import type { HeroMeta } from '../src/modules/heroes/heroes.types.js';
import { prepareDraftVisionInput } from '../src/modules/photo/draft-pick-bar.js';
import { GeminiPhotoAdapter } from '../src/modules/photo/gemini-photo.adapter.js';
import portraitIndex from '../src/modules/photo/hero-portrait-index.json' with { type: 'json' };
import {
  portraitCoarseTemplatesPerHero,
  portraitDetailedHeroPoolSize,
} from '../src/modules/photo/portrait-features.js';
import {
  normalizePortraitCatalog,
  portraitCatalogSha256,
} from '../src/modules/photo/portrait-catalog.js';
import {
  inspectDraftPortraits,
  recognizeDraftWithPortraitIndex,
} from '../src/modules/photo/local-portrait-recognizer.js';

const heroes: HeroMeta[] = portraitIndex.heroes.map((hero) => ({
  id: hero.id,
  name: `npc_dota_hero_${hero.slug}`,
  localizedName: hero.name,
  primaryAttribute: 'agi',
  attackType: 'Melee',
  roles: [],
  imageUrl: '',
  iconUrl: '',
  picks: 1,
  wins: 1,
  winRate: 1,
}));

const draftCases = [
  {
    fixture: 'draft-current-1.webp',
    allyGroup: 'right',
    expected: ['enemy:2:30', 'enemy:4:51', 'ally:1:27', 'ally:2:110', 'ally:3:26'],
  },
  {
    fixture: 'draft-current-2.webp',
    allyGroup: 'right',
    expected: ['enemy:1:50', 'enemy:3:88', 'ally:1:14', 'ally:2:26'],
  },
  {
    fixture: 'draft-current-3.webp',
    allyGroup: 'left',
    expected: [
      'ally:0:8',
      'ally:2:68',
      'ally:3:123',
      'ally:4:104',
      'enemy:0:72',
      'enemy:1:30',
      'enemy:2:18',
      'enemy:4:137',
    ],
  },
  {
    fixture: 'draft-current-4.webp',
    allyGroup: 'left',
    expected: ['ally:0:8', 'ally:2:68', 'ally:3:123', 'enemy:0:72', 'enemy:1:30'],
  },
  {
    fixture: 'draft-current-5.webp',
    allyGroup: 'left',
    expected: ['ally:1:75', 'ally:4:31', 'enemy:0:100', 'enemy:2:7'],
  },
] as const;

const testSlotRatios = [
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

const fixtureChecksums = {
  'dota-all-pick.jpg': '62c13e1b91bb575de223654fc07f5fe5d6b17599c1a1d5d9a13256a3c873f192',
  'draft-current-1.webp': 'b8524eb09e342e61acedb51afcba20fe5ee7afda5291cfe38c1bf32474b10449',
  'draft-current-2.webp': 'e99d3474d204f4cb38d4aaa54493c8e0ed1b9a4eb92e71da630e5b1a732e8d02',
  'draft-current-3.webp': '61c5c779e9df0f7f43053b1b102443adc94b62fe93d841a9e1c71c1c27995cfe',
  'draft-current-4.webp': '1e55a25f0f32f0d452fb0efb680b58e6448e282655b789bd39cb83469ba42aeb',
  'draft-current-5.webp': '3baaab25b200cb1d05b4fe070c644a562f0f1cab6f7784ee88a33194fe5cf360',
  'draft-screen-overlay.webp': '653f9c70dac985e7238d25269c83197e29dcf9b07583609abce242a31beb6237',
  'hero-grid-negative.webp': '3d54039993136bbd09eaba8645a6ba95c991c34f38bc8f40b6064116fc5ee495',
} as const;

async function fixture(name: string) {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url));
}

describe('local portrait recognition', () => {
  it('includes a deterministic full-catalog provenance manifest', async () => {
    const catalogSha256 = portraitCatalogSha256(portraitIndex.heroes);
    const portraitSourcesSha256 = createHash('sha256')
      .update(portraitIndex.heroes
        .map((hero) => `${hero.id}:${hero.slug}:${hero.sourceKind}:${hero.sourceSha256}`)
      .join('\n'))
      .digest('hex');
    const templatesSha256 = createHash('sha256')
      .update(gunzipSync(Buffer.from(portraitIndex.templatesGzipBase64, 'base64')))
      .digest('hex');
    const generatorSha256 = createHash('sha256')
      .update(await readFile(new URL('../scripts/generate-portrait-index.ts', import.meta.url)))
      .digest('hex');
    const featureSourceSha256 = createHash('sha256')
      .update(await readFile(new URL(
        '../src/modules/photo/portrait-features.ts',
        import.meta.url,
      )))
      .digest('hex');

    expect(portraitIndex).toMatchObject({
      version: 2,
      provenance: {
        catalogSha256,
        portraitSourcesSha256,
        templatesSha256,
        generatorSha256,
        featureSourceSha256,
        generatedAt: null,
        timestampPolicy: 'omitted-for-reproducible-builds',
        featureAlgorithm: 'normalized-grayscale-cosine-v2',
        coarseValidation: {
          queriesPerHero: 45,
          queryCount: 5_715,
          matchedQueryCount: 5_715,
          recallAtPool: 1,
          templatesPerHero: portraitCoarseTemplatesPerHero,
          poolSize: portraitDetailedHeroPoolSize,
        },
      },
    });
    expect(Number.isInteger(portraitIndex.provenance.coarseValidation.maxObservedRank))
      .toBe(true);
    expect(portraitIndex.provenance.coarseValidation.maxObservedRank)
      .toBeLessThanOrEqual(portraitDetailedHeroPoolSize);
    expect(portraitIndex.heroes).toHaveLength(127);
    expect(portraitIndex.heroes.map((hero) => hero.id)).toEqual(
      expect.arrayContaining([53, 155]),
    );
    expect(new Set(portraitIndex.heroes.map((hero) => hero.id))).toHaveProperty('size', 127);
    expect(portraitIndex.heroes.every((hero) => /^[a-f0-9]{64}$/.test(hero.sourceSha256)))
      .toBe(true);
  });

  it('normalizes an existing generated index before hashing an offline catalog', () => {
    const normalized = normalizePortraitCatalog(portraitIndex.heroes);

    expect(Object.keys(normalized[0] ?? {})).toEqual(['id', 'slug', 'name']);
    expect(portraitCatalogSha256(normalized)).toBe(portraitIndex.provenance.catalogSha256);
  });

  it('locks the portable regression corpus to reviewed content hashes', async () => {
    for (const [name, expected] of Object.entries(fixtureChecksums)) {
      const actual = createHash('sha256').update(await fixture(name)).digest('hex');
      expect(actual, name).toBe(expected);
    }
  });

  it.each(draftCases)(
    'recognizes exact occupied slots and player-relative sides in $fixture',
    async ({ fixture: name, expected, allyGroup }) => {
      const input = await prepareDraftVisionInput(await fixture(name));
      const result = await recognizeDraftWithPortraitIndex(input, heroes, { allyGroup });

      expect(result).toMatchObject({
        quality: 'clear',
        detectedPosition: null,
        model: 'local-portrait-index-v2-match-score',
      });
      expect(result?.recognized.map((entry) => `${entry.side}:${entry.slot}:${entry.heroId}`))
        .toEqual(expected);
      expect(result?.recognized.every((entry) => (
        entry.confidence >= 0.54
        && entry.confidence <= 0.93
        && !entry.needsReview
      ))).toBe(true);
      if (!result) throw new Error('Expected local recognition');
      const decision = createDesktopDraft(result, 2, 7);
      expect(decision).toEqual({
        status: 'ready',
        draft: {
          source: 'photo',
          position: 2,
          allyHeroIds: expected
            .filter((entry) => entry.startsWith('ally:'))
            .map((entry) => Number(entry.split(':')[2])),
          enemyHeroIds: expected
            .filter((entry) => entry.startsWith('enemy:'))
            .map((entry) => Number(entry.split(':')[2])),
          bannedHeroIds: [],
          rank: 7,
        },
      });
    },
  );

  it.each(draftCases)(
    'keeps $fixture side-neutral without an explicit local-team signal',
    async ({ fixture: name }) => {
      const input = await prepareDraftVisionInput(await fixture(name));
      const result = await recognizeDraftWithPortraitIndex(input, heroes);

      expect(result).toMatchObject({ quality: 'partial' });
      expect(result?.recognized.every((entry) => (
        entry.side === 'unknown' && entry.needsReview
      ))).toBe(true);
      if (!result) throw new Error('Expected side-neutral local recognition');
      expect(createDesktopDraft(result, 2, 7)).toEqual({
        status: 'waiting',
        reason: 'image_unclear',
      });
    },
  );

  it('completes the local fast path without a configured Gemini client', async () => {
    const adapter = new GeminiPhotoAdapter({
      apiKey: undefined,
      visionModel: 'gemini-3.5-flash-lite',
      timeoutMs: 15_000,
    });

    const result = await adapter.recognize(
      await fixture('draft-current-2.webp'),
      'image/webp',
      heroes,
      { allyGroup: 'right' },
    );

    expect(result.model).toBe('local-portrait-index-v2-match-score');
    expect(result.recognized.map((entry) => `${entry.side}:${entry.slot}:${entry.heroId}`))
      .toEqual(draftCases[1].expected);
  });

  it('does not call Gemini when the trusted local fast path is complete', async () => {
    const generateContent = vi.fn();
    const adapter = new GeminiPhotoAdapter(
      {
        apiKey: 'test-key',
        visionModel: 'gemini-3.5-flash-lite',
        timeoutMs: 15_000,
      },
      { generateContent },
    );

    const result = await adapter.recognize(
      await fixture('draft-current-1.webp'),
      'image/webp',
      heroes,
      { detectPosition: true, allyGroup: 'right' },
    );

    expect(result.model).toBe('local-portrait-index-v2-match-score');
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('keeps exact side-neutral local recognition without calling Gemini', async () => {
    const generateContent = vi.fn();
    const adapter = new GeminiPhotoAdapter(
      {
        apiKey: 'test-key',
        visionModel: 'gemini-3.5-flash-lite',
        timeoutMs: 15_000,
      },
      { generateContent },
    );

    const result = await adapter.recognize(
      await fixture('draft-current-2.webp'),
      'image/webp',
      heroes,
    );

    expect(result.quality).toBe('partial');
    expect(result.recognized).toHaveLength(4);
    expect(result.recognized.every((entry) => (
      entry.side === 'unknown' && entry.needsReview
    ))).toBe(true);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each([960, 1_280, 1_920, 2_560])('preserves exact slots at %ip width', async (width) => {
    const resized = await sharp(await fixture('draft-current-3.webp'))
      .resize({ width })
      .webp({ quality: 82 })
      .toBuffer();
    const input = await prepareDraftVisionInput(resized);
    const result = await recognizeDraftWithPortraitIndex(input, heroes, { allyGroup: 'left' });

    expect(result?.recognized.map((entry) => `${entry.side}:${entry.slot}:${entry.heroId}`))
      .toEqual(draftCases[2].expected);
  });

  it.each([
    [2, [2, 6], ['enemy:2:30', 'ally:1:27']],
    [3, [2, 4, 6], ['enemy:2:30', 'enemy:4:51', 'ally:1:27']],
    [4, [2, 4, 6, 7], ['enemy:2:30', 'enemy:4:51', 'ally:1:27', 'ally:2:110']],
  ] as const)('recognizes a sparse %i-pick draft without filling empty slots', async (
    _count,
    retainedSlots,
    expected,
  ) => {
    const source = await fixture('draft-current-1.webp');
    const metadata = await sharp(source).metadata();
    const width = metadata.width;
    const slotHalfWidth = Math.round(width * 0.026);
    const slotHeight = Math.round(width * 0.0336);
    const mask = await sharp({
      create: {
        width: slotHalfWidth * 2,
        height: slotHeight,
        channels: 3,
        background: '#20252b',
      },
    }).png().toBuffer();
    const occupiedSlots = [2, 4, 6, 7, 8];
    const retained = new Set<number>(retainedSlots);
    const sparse = await sharp(source)
      .composite(occupiedSlots
        .filter((slot) => !retained.has(slot))
        .map((slot) => ({
          input: mask,
          left: Math.round(width * (testSlotRatios[slot] ?? 0.5)) - slotHalfWidth,
          top: 0,
        })))
      .webp({ quality: 90 })
      .toBuffer();
    const input = await prepareDraftVisionInput(sparse);
    const result = await recognizeDraftWithPortraitIndex(input, heroes, { allyGroup: 'right' });

    expect(result?.recognized.map((entry) => `${entry.side}:${entry.slot}:${entry.heroId}`))
      .toEqual(expected);
  });

  it('falls back when a high-texture occupied slot cannot be identified', async () => {
    const source = await fixture('draft-current-1.webp');
    const metadata = await sharp(source).metadata();
    const width = metadata.width;
    const slotHalfWidth = Math.round(width * 0.026);
    const slotWidth = slotHalfWidth * 2;
    const slotHeight = Math.round(width * 0.0336);
    const solid = await sharp({
      create: {
        width: slotWidth,
        height: slotHeight,
        channels: 3,
        background: '#20252b',
      },
    }).png().toBuffer();
    const squares = Array.from(
      { length: Math.ceil(slotHeight / 6) * Math.ceil(slotWidth / 6) },
      (_value, index) => {
        const columns = Math.ceil(slotWidth / 6);
        const x = index % columns;
        const y = Math.floor(index / columns);
        return (x + y) % 2 === 0
          ? `<rect x="${x * 6}" y="${y * 6}" width="6" height="6" fill="#fff"/>`
          : '';
      },
    ).join('');
    const checker = Buffer.from(
      `<svg width="${slotWidth}" height="${slotHeight}"><rect width="100%" height="100%" fill="#000"/>${squares}</svg>`,
    );
    const slotLeft = (slot: number) => (
      Math.round(width * (testSlotRatios[slot] ?? 0.5)) - slotHalfWidth
    );
    const ambiguous = await sharp(source)
      .composite([
        { input: checker, left: slotLeft(4), top: 0 },
        { input: solid, left: slotLeft(7), top: 0 },
        { input: solid, left: slotLeft(8), top: 0 },
      ])
      .webp({ quality: 90 })
      .toBuffer();
    const input = await prepareDraftVisionInput(ambiguous);
    const inspected = await inspectDraftPortraits(input);

    expect(inspected?.slots[4]).toMatchObject({ present: false });
    expect(inspected?.slots[4]?.grayDeviation).toBeGreaterThanOrEqual(48);
    await expect(recognizeDraftWithPortraitIndex(input, heroes, { allyGroup: 'right' }))
      .resolves.toBeNull();
  });

  it('keeps visual-group evidence separate from player-side assumptions', async () => {
    const input = await prepareDraftVisionInput(await fixture('dota-all-pick.jpg'));
    const inspected = await inspectDraftPortraits(input);

    expect(inspected?.slots
      .filter((entry) => entry.present)
      .map((entry) => `${entry.slot}:${entry.top.heroId}`))
      .toEqual([
        '0:8',
        '1:99',
        '2:21',
        '3:35',
        '5:46',
        '6:93',
        '7:75',
        '8:20',
        '9:120',
      ]);
    const result = await recognizeDraftWithPortraitIndex(input, heroes);
    expect(result?.recognized.every((entry) => entry.side === 'unknown')).toBe(true);
  });

  it('continues to later eligible crops when the first candidate is not a draft', async () => {
    const nonDraft = await sharp({
      create: {
        width: 1_600,
        height: 144,
        channels: 3,
        background: '#20252b',
      },
    }).webp().toBuffer();
    const invalidInput = await prepareDraftVisionInput(nonDraft);
    const validInput = await prepareDraftVisionInput(await fixture('draft-current-2.webp'));
    const invalid = invalidInput.candidates[0];
    const valid = validInput.candidates[0];
    if (!invalid || !valid) throw new Error('Expected prepared candidates');
    const encodedValid = { ...valid, id: 'B' as const };
    Reflect.deleteProperty(encodedValid, 'localSource');
    const input = {
      ...validInput,
      candidates: [
        { ...invalid, id: 'A' as const },
        encodedValid,
      ],
    };

    const inspected = await inspectDraftPortraits(input);
    const result = await recognizeDraftWithPortraitIndex(input, heroes, { allyGroup: 'right' });

    expect(inspected?.candidate.id).toBe('B');
    expect(result?.recognized.map((entry) => `${entry.side}:${entry.slot}:${entry.heroId}`))
      .toEqual(draftCases[1].expected);
  });

  it('yields to the event loop during full-catalog classification', async () => {
    const input = await prepareDraftVisionInput(await fixture('draft-current-3.webp'));
    let timerFired = false;
    const timer = setTimeout(() => {
      timerFired = true;
    }, 0);

    const result = await recognizeDraftWithPortraitIndex(input, heroes, { allyGroup: 'left' });
    clearTimeout(timer);

    expect(result?.quality).toBe('clear');
    expect(timerFired).toBe(true);
  });

  it('extracts the top draft bar from a full screen with an overlapping companion overlay', async () => {
    const input = await prepareDraftVisionInput(await fixture('draft-screen-overlay.webp'));
    const result = await recognizeDraftWithPortraitIndex(input, heroes, { allyGroup: 'right' });

    expect(input).toMatchObject({
      sourceKind: 'screenshot',
      candidates: [{ strategy: 'screen_top', sourceTopRatio: 0 }],
    });
    expect(result?.recognized.map((entry) => `${entry.side}:${entry.slot}:${entry.heroId}`))
      .toEqual(draftCases[0].expected);
  });

  it('rejects a compressed hero grid even when one cell resembles a portrait slot', async () => {
    const input = await prepareDraftVisionInput(await fixture('hero-grid-negative.webp'));
    const inspected = await inspectDraftPortraits(input);

    expect(inspected?.slots.filter((entry) => entry.present)).toHaveLength(1);
    await expect(recognizeDraftWithPortraitIndex(input, heroes)).resolves.toBeNull();
  });

  it('rejects a non-draft band before portrait classification', async () => {
    const image = await sharp({
      create: {
        width: 1_600,
        height: 144,
        channels: 3,
        background: '#20252b',
      },
    }).webp().toBuffer();
    const input = await prepareDraftVisionInput(image);
    const inspected = await inspectDraftPortraits(input);

    expect(inspected?.centerLooksLikeDraft).toBe(false);
    await expect(recognizeDraftWithPortraitIndex(input, heroes)).resolves.toBeNull();
  });

  it('falls back instead of accepting an ambiguous blurred bar', async () => {
    const blurred = await sharp(await fixture('draft-current-3.webp'))
      .blur(3)
      .webp()
      .toBuffer();
    const input = await prepareDraftVisionInput(blurred);
    const inspected = await inspectDraftPortraits(input);

    expect(inspected?.slots.some((entry) => entry.present && !entry.strong)).toBe(true);
    await expect(recognizeDraftWithPortraitIndex(input, heroes)).resolves.toBeNull();
  });

  it('rejects duplicate hero matches across occupied slots', async () => {
    const source = await fixture('draft-current-1.webp');
    const decoded = await sharp(source).png().toBuffer();
    const portrait = await sharp(decoded)
      .extract({ left: 385, top: 0, width: 84, height: 54 })
      .png()
      .toBuffer();
    const duplicate = await sharp(decoded)
      .composite([{ input: portrait, left: 171, top: 0 }])
      .png()
      .toBuffer();
    const input = await prepareDraftVisionInput(duplicate);
    const inspected = await inspectDraftPortraits(input);
    const witchDoctorMatches = inspected?.slots.filter((entry) => (
      entry.present && entry.top.heroId === 30
    ));

    expect(witchDoctorMatches).toHaveLength(2);
    await expect(recognizeDraftWithPortraitIndex(input, heroes)).resolves.toBeNull();
  });
});
