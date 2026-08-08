import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createDesktopDraft } from '../src/modules/analysis/desktop-analysis.js';
import { GeminiPhotoAdapter } from '../src/modules/photo/gemini-photo.adapter.js';
import type { HeroMeta } from '../src/modules/heroes/heroes.types.js';

const config = {
  apiKey: 'test-gemini-key',
  visionModel: 'gemini-3.5-flash-lite',
  timeoutMs: 30_000,
} as const;

function hero(id: number, name: string, localizedName: string): HeroMeta {
  return {
    id,
    name,
    localizedName,
    primaryAttribute: 'agi',
    attackType: 'Melee',
    roles: ['Carry'],
    imageUrl: `https://example.com/${id}.png`,
    iconUrl: `https://example.com/${id}-icon.png`,
    picks: 100,
    wins: 52,
    winRate: 0.52,
  };
}

const heroes: HeroMeta[] = [
  hero(1, 'npc_dota_hero_antimage', 'Anti-Mage'),
  hero(2, 'npc_dota_hero_axe', 'Axe'),
  hero(3, 'npc_dota_hero_bane', 'Bane'),
  hero(20, 'npc_dota_hero_vengefulspirit', 'Vengeful Spirit'),
  hero(23, 'npc_dota_hero_kunkka', 'Kunkka'),
  hero(25, 'npc_dota_hero_lina', 'Lina'),
  hero(34, 'npc_dota_hero_tinker', 'Tinker'),
  hero(39, 'npc_dota_hero_queenofpain', 'Queen of Pain'),
  hero(40, 'npc_dota_hero_venomancer', 'Venomancer'),
  hero(46, 'npc_dota_hero_templar_assassin', 'Templar Assassin'),
  hero(54, 'npc_dota_hero_life_stealer', 'Lifestealer'),
  hero(73, 'npc_dota_hero_alchemist', 'Alchemist'),
  hero(120, 'npc_dota_hero_pangolier', 'Pangolier'),
];
let testImage = Buffer.alloc(0);
let clearTestImage = Buffer.alloc(0);

beforeAll(async () => {
  testImage = await sharp({
    create: {
      width: 800,
      height: 450,
      channels: 3,
      background: '#17202A',
    },
  }).jpeg().toBuffer();
  clearTestImage = await sharp({
    create: {
      width: 800,
      height: 450,
      channels: 3,
      background: '#88929A',
    },
  }).jpeg().toBuffer();
});

function addVisualTeamGroups(value: unknown) {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.recognized)) return value;
  const recognized = record.recognized.map((item: unknown) => {
    if (!item || typeof item !== 'object') return item;
    const entry = item as Record<string, unknown>;
    const teamGroup = entry.side === 'ally'
      ? 'left'
      : entry.side === 'enemy'
        ? 'right'
        : entry.side === 'unknown'
          ? 'left'
          : undefined;
    return teamGroup ? { ...entry, teamGroup } : entry;
  });
  const occupied = new Set<string>();
  for (const item of recognized) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (
      entry.sourceRegion === 'team_pick_slot'
      && (entry.teamGroup === 'left' || entry.teamGroup === 'right')
      && typeof entry.slot === 'number'
    ) {
      occupied.add(`${entry.teamGroup}:${entry.slot}`);
    }
  }
  const slotInventory = Array.isArray(record.slotInventory)
    ? record.slotInventory
    : (['left', 'right'] as const).flatMap((teamGroup) => (
      Array.from({ length: 5 }, (_item, slot) => ({
        teamGroup,
        slot,
        state: occupied.has(`${teamGroup}:${slot}`) ? 'occupied' : 'empty',
      }))
    ));
  return {
    ...record,
    slotInventory,
    recognized,
  };
}

function response(value: unknown, modelVersion = 'gemini-3.5-flash-lite-001') {
  return {
    text: JSON.stringify(addVisualTeamGroups(value)),
    modelVersion,
  } as GenerateContentResponse;
}

describe('GeminiPhotoAdapter', () => {
  it('sends an inline image with a JSON schema and maps recognized heroes', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['opposing_team_slots', 'draft_countdown', 'draft_mode_label'],
        quality: 'clear',
        recognized: [
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 0,
            heroName: 'Anti Mage',
            confidence: 0.96,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'unknown',
            slot: 1,
            heroName: 'Axe',
            confidence: 0.7,
          },
        ],
    }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });
    const image = testImage;

    const result = await adapter.recognize(
      image,
      'image/jpeg',
      heroes,
      { allyGroup: 'left' },
    );

    expect(result).toEqual({
      quality: 'partial',
      orientationSource: 'explicit_signal',
      detectedPosition: null,
      recognized: [
        {
          side: 'ally',
          visualGroup: 'left',
          slot: 1,
          heroId: 2,
          heroName: 'Axe',
          localizedName: 'Axe',
          confidence: 0.7,
          needsReview: true,
        },
        {
          side: 'enemy',
          visualGroup: 'right',
          slot: 0,
          heroId: 1,
          heroName: 'Anti Mage',
          localizedName: 'Anti-Mage',
          confidence: 0.93,
          needsReview: true,
        },
      ],
      model: 'gemini-3.5-flash-lite-001',
    });
    expect(generateContent).toHaveBeenCalledOnce();
    const request = generateContent.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      model: config.visionModel,
      config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 768,
      },
    });
    expect(JSON.stringify(request?.contents)).toContain('Anti-Mage, Axe');
    expect(JSON.stringify(request?.contents)).not.toContain(image.toString('base64'));
    expect(JSON.stringify(request?.contents)).toContain('Companion apps, websites, dashboards');
    expect(JSON.stringify(request?.contents)).toContain('at least two independent draft UI signals');
    expect(JSON.stringify(request?.contents)).toContain('Never return portraits from the central hero-selection grid');
    expect(JSON.stringify(request?.contents)).toContain('Rank medals, rank numbers');
    const requestPayload = JSON.parse(JSON.stringify(request)) as {
      contents: {
        parts: {
          inlineData?: { data: string; mimeType: string };
          mediaResolution?: { level?: string };
        }[];
      }[];
    };
    const imagePart = requestPayload.contents[0]?.parts.find((part) => part.inlineData);
    const inlineData = imagePart?.inlineData;
    expect(inlineData?.mimeType).toBe('image/jpeg');
    expect(imagePart?.mediaResolution?.level).toBe('MEDIA_RESOLUTION_HIGH');
    const pickBar = Buffer.from(inlineData?.data ?? '', 'base64');
    expect(pickBar.equals(image)).toBe(false);
    await expect(sharp(pickBar).metadata()).resolves.toMatchObject({
      format: 'jpeg',
      width: 1_200,
      height: 108,
    });
    expect(request?.config?.responseJsonSchema).toMatchObject({
      type: 'object',
      required: [
        'selectedCandidate',
        'screenContext',
        'draftUiEvidence',
        'quality',
        'slotInventory',
        'recognized',
      ],
    });
    expect(request?.config?.responseJsonSchema).not.toHaveProperty('$schema');
  });

  it('maps Gemini visual groups through a trusted orientation and fails closed without it', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['opposing_team_slots', 'draft_countdown'],
        quality: 'clear',
        recognized: [{
          sourceRegion: 'team_pick_slot',
          side: 'enemy',
          slot: 2,
          heroName: 'Anti-Mage',
          confidence: 0.93,
        }],
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const rightAllies = await adapter.recognize(
      clearTestImage,
      'image/jpeg',
      heroes,
      { allyGroup: 'right', orientationSource: 'manual_confirmation' },
    );
    const unconfirmed = await adapter.recognize(clearTestImage, 'image/jpeg', heroes);

    expect(rightAllies).toMatchObject({
      quality: 'clear',
      orientationSource: 'manual_confirmation',
      recognized: [{ side: 'ally', visualGroup: 'right', needsReview: false }],
    });
    expect(unconfirmed).toMatchObject({
      quality: 'partial',
      recognized: [{ side: 'unknown', visualGroup: 'right', needsReview: true }],
    });
    expect(unconfirmed).not.toHaveProperty('orientationSource');
  });

  it('fails closed to the saved manual position without a second model request', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['opposing_team_slots', 'draft_countdown'],
        quality: 'clear',
        recognized: [],
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(
      clearTestImage,
      'image/jpeg',
      heroes,
      { detectPosition: true },
    );

    expect(result.detectedPosition).toBeNull();
    expect(generateContent).toHaveBeenCalledOnce();
  });

  it('downgrades clear output when an occupied slot has no recognized identity', async () => {
    const slotInventory = (['left', 'right'] as const).flatMap((teamGroup) => (
      Array.from({ length: 5 }, (_item, slot) => ({
        teamGroup,
        slot,
        state: teamGroup === 'right' && slot <= 2 ? 'occupied' : 'empty',
      }))
    ));
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['opposing_team_slots', 'draft_countdown'],
        quality: 'clear',
        slotInventory,
        recognized: [
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 0,
            heroName: 'Anti-Mage',
            confidence: 1,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 1,
            heroName: 'Axe',
            confidence: 1,
          },
        ],
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(
      clearTestImage,
      'image/jpeg',
      heroes,
      { allyGroup: 'left' },
    );

    expect(result).toMatchObject({
      quality: 'partial',
      recognized: [
        { visualGroup: 'right', slot: 0, heroId: 1 },
        { visualGroup: 'right', slot: 1, heroId: 2 },
      ],
    });
    expect(createDesktopDraft(result, 2, 7)).toEqual({
      status: 'waiting',
      reason: 'image_unclear',
    });
  });

  it('deduplicates positions, flags hero conflicts, and returns stable partial output', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['opposing_team_slots', 'draft_countdown'],
        quality: 'clear',
        recognized: [
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 2,
            heroName: 'Axe',
            confidence: 0.68,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'unknown',
            slot: 0,
            heroName: 'Bane',
            confidence: 0.99,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 3,
            heroName: 'Unknown Hero',
            confidence: 0.97,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'ally',
            slot: 4,
            heroName: 'Anti-Mage',
            confidence: 0.91,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 2,
            heroName: 'Anti Mage',
            confidence: 0.96,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 4,
            heroName: 'Axe',
            confidence: 0.81,
          },
        ],
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(
      testImage,
      'image/jpeg',
      heroes,
      { allyGroup: 'left' },
    );

    expect(result).toEqual({
      quality: 'partial',
      orientationSource: 'explicit_signal',
      detectedPosition: null,
      recognized: [
        {
          side: 'ally',
          visualGroup: 'left',
          slot: 0,
          heroId: 3,
          heroName: 'Bane',
          localizedName: 'Bane',
          confidence: 0.93,
          needsReview: true,
        },
        {
          side: 'ally',
          visualGroup: 'left',
          slot: 4,
          heroId: 1,
          heroName: 'Anti-Mage',
          localizedName: 'Anti-Mage',
          confidence: 0.91,
          needsReview: true,
        },
        {
          side: 'enemy',
          visualGroup: 'right',
          slot: 2,
          heroId: 1,
          heroName: 'Anti Mage',
          localizedName: 'Anti-Mage',
          confidence: 0.93,
          needsReview: true,
        },
        {
          side: 'enemy',
          visualGroup: 'right',
          slot: 3,
          heroId: null,
          heroName: 'Unknown Hero',
          localizedName: null,
          confidence: 0.93,
          needsReview: true,
        },
        {
          side: 'enemy',
          visualGroup: 'right',
          slot: 4,
          heroId: 2,
          heroName: 'Axe',
          localizedName: 'Axe',
          confidence: 0.81,
          needsReview: true,
        },
      ],
      model: 'gemini-3.5-flash-lite-001',
    });
  });

  it('preserves distinct unknown-side heroes reported in the same slot', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['opposing_team_slots', 'draft_countdown'],
        quality: 'clear',
        recognized: [
          {
            sourceRegion: 'team_pick_slot',
            side: 'ally',
            slot: 0,
            heroName: 'Axe',
            confidence: 0.94,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 0,
            heroName: 'Bane',
            confidence: 0.92,
          },
        ],
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(testImage, 'image/jpeg', heroes);

    expect(result.quality).toBe('partial');
    expect(result.recognized).toEqual([
      {
        side: 'unknown',
        visualGroup: 'left',
        slot: 0,
        heroId: 2,
        heroName: 'Axe',
        localizedName: 'Axe',
        confidence: 0.93,
        needsReview: true,
      },
      {
        side: 'unknown',
        visualGroup: 'right',
        slot: 0,
        heroId: 3,
        heroName: 'Bane',
        localizedName: 'Bane',
        confidence: 0.92,
        needsReview: true,
      },
    ]);
  });

  it('orders visual groups deterministically across model response permutations', async () => {
    const entries = [
      {
        sourceRegion: 'team_pick_slot',
        side: 'enemy',
        slot: 0,
        heroName: 'Bane',
        confidence: 0.92,
      },
      {
        sourceRegion: 'team_pick_slot',
        side: 'ally',
        slot: 0,
        heroName: 'Axe',
        confidence: 0.94,
      },
    ];
    const output = (recognized: typeof entries) => response({
      selectedCandidate: 'A',
      screenContext: 'dota_draft',
      draftUiEvidence: ['opposing_team_slots', 'draft_countdown'],
      quality: 'clear',
      recognized,
    });
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValueOnce(output(entries))
      .mockResolvedValueOnce(output(entries.toReversed()));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const first = await adapter.recognize(clearTestImage, 'image/jpeg', heroes);
    const second = await adapter.recognize(clearTestImage, 'image/jpeg', heroes);

    expect(second.recognized).toEqual(first.recognized);
    expect(first.recognized.map(({ visualGroup, slot, heroId }) => ({
      visualGroup,
      slot,
      heroId,
    }))).toEqual([
      { visualGroup: 'left', slot: 0, heroId: 2 },
      { visualGroup: 'right', slot: 0, heroId: 3 },
    ]);
  });

  it('returns no picks when Gemini classifies the image as unrelated', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        selectedCandidate: 'A',
        screenContext: 'not_dota_draft',
        draftUiEvidence: [],
        quality: 'not_dota',
        recognized: [{
          sourceRegion: 'hero_selection_grid',
          side: 'enemy',
          slot: 0,
          heroName: 'Axe',
          confidence: 0.99,
        }],
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(testImage, 'image/jpeg', heroes);

    expect(result.quality).toBe('not_dota');
    expect(result.detectedPosition).toBeNull();
    expect(result.recognized).toEqual([]);
  });

  it('rejects hero detections from a non-draft Dota companion screen', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        selectedCandidate: 'A',
        screenContext: 'not_dota_draft',
        draftUiEvidence: [],
        quality: 'clear',
        recognized: [
          {
            sourceRegion: 'hero_selection_grid',
            side: 'enemy',
            slot: 0,
            heroName: 'Axe',
            confidence: 0.98,
          },
        ],
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(testImage, 'image/jpeg', heroes);

    expect(result).toMatchObject({
      quality: 'not_dota',
      recognized: [],
    });
  });

  it('requires two independent draft UI signals including one strong signal', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['draft_countdown'],
        quality: 'clear',
        recognized: [
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 0,
            heroName: 'Axe',
            confidence: 0.98,
          },
        ],
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(testImage, 'image/jpeg', heroes);

    expect(result).toMatchObject({
      quality: 'not_dota',
      recognized: [],
    });
  });

  it('accepts only an exact high-confidence identity from a reliable clear crop', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['opposing_team_slots', 'draft_countdown'],
        quality: 'clear',
        recognized: [{
          sourceRegion: 'team_pick_slot',
          side: 'enemy',
          slot: 0,
          heroName: 'Axe',
          confidence: 1,
        }],
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(
      clearTestImage,
      'image/jpeg',
      heroes,
      { allyGroup: 'left' },
    );

    expect(result).toMatchObject({
      quality: 'clear',
      recognized: [{
        heroId: 2,
        confidence: 0.93,
        needsReview: false,
      }],
    });
  });

  it('keeps fuzzy hero-name matches under review even at maximum model confidence', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['opposing_team_slots', 'draft_countdown'],
        quality: 'clear',
        recognized: [{
          sourceRegion: 'team_pick_slot',
          side: 'enemy',
          slot: 0,
          heroName: 'Ax',
          confidence: 1,
        }],
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(
      clearTestImage,
      'image/jpeg',
      heroes,
      { allyGroup: 'left' },
    );

    expect(result).toMatchObject({
      quality: 'partial',
      recognized: [{
        heroId: 2,
        confidence: 0.93,
        needsReview: true,
      }],
    });
  });

  it('preserves a verified pick when another pick makes the overall result partial', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['opposing_team_slots', 'draft_countdown'],
        quality: 'clear',
        recognized: [
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 0,
            heroName: 'Axe',
            confidence: 1,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 1,
            heroName: 'Bane',
            confidence: 0.9,
          },
        ],
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(
      clearTestImage,
      'image/jpeg',
      heroes,
      { allyGroup: 'left' },
    );

    expect(result.quality).toBe('partial');
    expect(result.recognized).toMatchObject([
      {
        heroId: 2,
        confidence: 0.93,
        needsReview: false,
      },
      {
        heroId: 3,
        confidence: 0.9,
        needsReview: true,
      },
    ]);
  });

  it('keeps the all-pick team bars in slot order and ignores grid portraits', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['opposing_team_slots', 'draft_countdown', 'draft_mode_label'],
        quality: 'clear',
        recognized: [
          {
            sourceRegion: 'team_pick_slot',
            side: 'ally',
            slot: 0,
            heroName: 'Kunkka',
            confidence: 0.97,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'ally',
            slot: 1,
            heroName: 'Alchemist',
            confidence: 0.95,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'ally',
            slot: 2,
            heroName: 'Lina',
            confidence: 0.96,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'ally',
            slot: 3,
            heroName: 'Tinker',
            confidence: 0.94,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 0,
            heroName: 'Templar Assassin',
            confidence: 0.96,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 1,
            heroName: 'Lifestealer',
            confidence: 0.95,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 2,
            heroName: 'Anti-Mage',
            confidence: 0.94,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 3,
            heroName: 'Vengeful Spirit',
            confidence: 0.93,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'enemy',
            slot: 4,
            heroName: 'Pangolier',
            confidence: 0.92,
          },
          {
            sourceRegion: 'hero_selection_grid',
            side: 'enemy',
            slot: 1,
            heroName: 'Venomancer',
            confidence: 0.99,
          },
        ],
    }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });
    const allPickImage = await readFile(new URL('./fixtures/dota-all-pick.jpg', import.meta.url));

    const result = await adapter.recognize(allPickImage, 'image/jpeg', heroes);

    expect(allPickImage).toHaveLength(388_978);
    expect(JSON.stringify(generateContent.mock.calls[0]?.[0].contents)).not.toContain(
      allPickImage.toString('base64'),
    );
    expect(result.quality).toBe('partial');
    expect(result.recognized.map(({ side, visualGroup, slot, heroId }) => ({
      side,
      visualGroup,
      slot,
      heroId,
    }))).toEqual([
      { side: 'unknown', visualGroup: 'left', slot: 0, heroId: 23 },
      { side: 'unknown', visualGroup: 'left', slot: 1, heroId: 73 },
      { side: 'unknown', visualGroup: 'left', slot: 2, heroId: 25 },
      { side: 'unknown', visualGroup: 'left', slot: 3, heroId: 34 },
      { side: 'unknown', visualGroup: 'right', slot: 0, heroId: 46 },
      { side: 'unknown', visualGroup: 'right', slot: 1, heroId: 54 },
      { side: 'unknown', visualGroup: 'right', slot: 2, heroId: 1 },
      { side: 'unknown', visualGroup: 'right', slot: 3, heroId: 20 },
      { side: 'unknown', visualGroup: 'right', slot: 4, heroId: 120 },
    ]);
  });

  it('fails safely when no Gemini key is configured', async () => {
    const adapter = new GeminiPhotoAdapter({ ...config, apiKey: undefined });

    await expect(
      adapter.recognize(testImage, 'image/jpeg', heroes),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'EXTERNAL_SERVICE_UNAVAILABLE',
      details: { missing: 'GEMINI_API_KEY' },
    });
  });

  it('rejects malformed model output without exposing it', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue({
        text: '{not-json',
      } as GenerateContentResponse);
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    await expect(
      adapter.recognize(testImage, 'image/jpeg', heroes),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'IMAGE_RECOGNITION_FAILED',
      message: 'The recognition response was invalid',
    });
  });
});
