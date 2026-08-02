import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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

function response(value: unknown, modelVersion = 'gemini-3.5-flash-lite-001') {
  return {
    text: JSON.stringify(value),
    modelVersion,
  } as GenerateContentResponse;
}

function positionResponse(value: unknown) {
  return {
    text: JSON.stringify(value),
    modelVersion: 'gemini-3.5-flash-lite-001',
  } as GenerateContentResponse;
}

type PositionRoleLabel =
  | 'safe_lane'
  | 'mid_lane'
  | 'off_lane'
  | 'soft_support'
  | 'support'
  | 'hard_support';

function completePositionCards(selectedRole: PositionRoleLabel | null) {
  const supportRole = selectedRole === 'soft_support' ? 'soft_support' : 'support';
  const roles: PositionRoleLabel[] = [
    'safe_lane',
    'mid_lane',
    'off_lane',
    supportRole,
    'hard_support',
  ];
  return roles.map((roleLabel, slot) => ({
    teamGroup: 'right' as const,
    slot,
    playerNameVisible: roleLabel !== selectedRole,
    roleLabel,
    confidence: 0.99,
  }));
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

    const result = await adapter.recognize(image, 'image/jpeg', heroes);

    expect(result).toEqual({
      quality: 'partial',
      detectedPosition: null,
      recognized: [
        {
          side: 'enemy',
          slot: 0,
          heroId: 1,
          heroName: 'Anti Mage',
          localizedName: 'Anti-Mage',
          confidence: 0.96,
          needsReview: true,
        },
        {
          side: 'unknown',
          slot: 1,
          heroId: 2,
          heroName: 'Axe',
          localizedName: 'Axe',
          confidence: 0.7,
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
      required: ['selectedCandidate', 'screenContext', 'draftUiEvidence', 'quality', 'recognized'],
    });
    expect(request?.config?.responseJsonSchema).not.toHaveProperty('$schema');
  });

  it.each([
    ['safe_lane', 1],
    ['mid_lane', 2],
    ['off_lane', 3],
    ['soft_support', 4],
    ['support', 4],
    ['hard_support', 5],
  ] as const)('maps an explicit own-card %s label to position %s', async (roleLabel, position) => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValueOnce(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['opposing_team_slots', 'draft_countdown'],
        quality: 'clear',
        recognized: [],
      }))
      .mockResolvedValueOnce(positionResponse({
        cards: completePositionCards(roleLabel),
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(
      clearTestImage,
      'image/jpeg',
      heroes,
      { detectPosition: true },
    );

    expect(result.detectedPosition).toBe(position);
    expect(generateContent).toHaveBeenCalledTimes(2);
    const positionRequest = generateContent.mock.calls[1]?.[0];
    expect(positionRequest?.config).toMatchObject({
      responseMimeType: 'application/json',
      maxOutputTokens: 512,
      responseJsonSchema: {
        type: 'object',
        required: ['cards'],
      },
    });
    const positionPrompt = JSON.stringify(positionRequest?.contents);
    expect(positionPrompt).toContain('List every visible player card');
    expect(positionPrompt).toContain('Do not identify the current user');
    expect(positionPrompt).toContain('Do not use visual color');
    expect(positionPrompt).not.toContain('selectionEmphasis');
  });

  it('starts the dedicated detector without waiting for main recognition', async () => {
    let resolveRecognition: (value: GenerateContentResponse) => void = () => undefined;
    const pendingRecognition = new Promise<GenerateContentResponse>((resolve) => {
      resolveRecognition = resolve;
    });
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockImplementationOnce(() => pendingRecognition)
      .mockResolvedValueOnce(positionResponse({
        cards: completePositionCards('mid_lane'),
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });
    const resultPromise = adapter.recognize(
      clearTestImage,
      'image/jpeg',
      heroes,
      { detectPosition: true },
    );

    await vi.waitFor(() => expect(generateContent).toHaveBeenCalledTimes(2));
    resolveRecognition(response({
      selectedCandidate: 'A',
      screenContext: 'dota_draft',
      draftUiEvidence: ['opposing_team_slots', 'draft_countdown'],
      quality: 'clear',
      recognized: [],
    }));

    await expect(resultPromise).resolves.toMatchObject({ detectedPosition: 2 });
  });

  it.each([
    [{
      cards: completePositionCards('mid_lane').slice(0, 4),
    }],
    [{
      cards: completePositionCards('mid_lane').map((card) => (
        card.roleLabel === 'safe_lane' ? { ...card, playerNameVisible: false } : card
      )),
    }],
    [{
      cards: completePositionCards('off_lane').map((card) => (
        card.roleLabel === 'off_lane' ? { ...card, confidence: 0.949 } : card
      )),
    }],
    [{
      cards: completePositionCards('mid_lane').map((card) => (
        card.roleLabel === 'hard_support' ? { ...card, slot: 3 } : card
      )),
    }],
    [{
      cards: completePositionCards('mid_lane').map((card) => (
        card.roleLabel === 'hard_support' ? { ...card, roleLabel: 'soft_support' as const } : card
      )),
    }],
    [{ cards: completePositionCards(null) }],
  ] as const)('does not infer a position from unsafe role evidence', async (positionDetection) => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValueOnce(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['opposing_team_slots', 'draft_countdown'],
        quality: 'clear',
        recognized: [],
      }))
      .mockResolvedValueOnce(positionResponse(positionDetection));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(
      clearTestImage,
      'image/jpeg',
      heroes,
      { detectPosition: true },
    );

    expect(result.detectedPosition).toBeNull();
  });

  it('keeps recognition usable when the dedicated position request fails', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValueOnce(response({
        selectedCandidate: 'A',
        screenContext: 'dota_draft',
        draftUiEvidence: ['opposing_team_slots', 'draft_countdown'],
        quality: 'clear',
        recognized: [],
      }))
      .mockRejectedValueOnce(new Error('Position detector unavailable'));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(
      clearTestImage,
      'image/jpeg',
      heroes,
      { detectPosition: true },
    );

    expect(result).toMatchObject({
      quality: 'clear',
      detectedPosition: null,
      recognized: [],
    });
  });

  it('skips the dedicated request when the top crop is enhanced', async () => {
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
      testImage,
      'image/jpeg',
      heroes,
      { detectPosition: true },
    );

    expect(result.detectedPosition).toBeNull();
    expect(generateContent).toHaveBeenCalledOnce();
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

    const result = await adapter.recognize(testImage, 'image/jpeg', heroes);

    expect(result).toEqual({
      quality: 'partial',
      detectedPosition: null,
      recognized: [
        {
          side: 'ally',
          slot: 4,
          heroId: 1,
          heroName: 'Anti-Mage',
          localizedName: 'Anti-Mage',
          confidence: 0.91,
          needsReview: true,
        },
        {
          side: 'enemy',
          slot: 2,
          heroId: 1,
          heroName: 'Anti Mage',
          localizedName: 'Anti-Mage',
          confidence: 0.96,
          needsReview: true,
        },
        {
          side: 'enemy',
          slot: 3,
          heroId: null,
          heroName: 'Unknown Hero',
          localizedName: null,
          confidence: 0.97,
          needsReview: true,
        },
        {
          side: 'enemy',
          slot: 4,
          heroId: 2,
          heroName: 'Axe',
          localizedName: 'Axe',
          confidence: 0.81,
          needsReview: true,
        },
        {
          side: 'unknown',
          slot: 0,
          heroId: 3,
          heroName: 'Bane',
          localizedName: 'Bane',
          confidence: 0.99,
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
            side: 'unknown',
            slot: 0,
            heroName: 'Axe',
            confidence: 0.94,
          },
          {
            sourceRegion: 'team_pick_slot',
            side: 'unknown',
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
        slot: 0,
        heroId: 2,
        heroName: 'Axe',
        localizedName: 'Axe',
        confidence: 0.94,
        needsReview: true,
      },
      {
        side: 'unknown',
        slot: 0,
        heroId: 3,
        heroName: 'Bane',
        localizedName: 'Bane',
        confidence: 0.92,
        needsReview: true,
      },
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

    const result = await adapter.recognize(clearTestImage, 'image/jpeg', heroes);

    expect(result).toMatchObject({
      quality: 'clear',
      recognized: [{
        heroId: 2,
        confidence: 0.99,
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

    const result = await adapter.recognize(clearTestImage, 'image/jpeg', heroes);

    expect(result).toMatchObject({
      quality: 'partial',
      recognized: [{
        heroId: 2,
        confidence: 0.99,
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

    const result = await adapter.recognize(clearTestImage, 'image/jpeg', heroes);

    expect(result.quality).toBe('partial');
    expect(result.recognized).toMatchObject([
      {
        heroId: 2,
        confidence: 0.99,
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
    expect(result.recognized.map(({ side, slot, heroId }) => ({ side, slot, heroId }))).toEqual([
      { side: 'ally', slot: 0, heroId: 23 },
      { side: 'ally', slot: 1, heroId: 73 },
      { side: 'ally', slot: 2, heroId: 25 },
      { side: 'ally', slot: 3, heroId: 34 },
      { side: 'enemy', slot: 0, heroId: 46 },
      { side: 'enemy', slot: 1, heroId: 54 },
      { side: 'enemy', slot: 2, heroId: 1 },
      { side: 'enemy', slot: 3, heroId: 20 },
      { side: 'enemy', slot: 4, heroId: 120 },
    ]);
  });

  it('fails safely when no Gemini key is configured', async () => {
    const adapter = new GeminiPhotoAdapter({ ...config, apiKey: undefined });

    await expect(
      adapter.recognize(Buffer.from('image'), 'image/webp', heroes),
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
