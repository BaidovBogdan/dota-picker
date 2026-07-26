import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { GeminiPhotoAdapter } from '../src/modules/photo/gemini-photo.adapter.js';
import type { HeroMeta } from '../src/modules/heroes/heroes.types.js';

const config = {
  apiKey: 'test-gemini-key',
  visionModel: 'gemini-3.5-flash-lite',
  timeoutMs: 30_000,
} as const;

const heroes: HeroMeta[] = [
  {
    id: 1,
    name: 'npc_dota_hero_antimage',
    localizedName: 'Anti-Mage',
    primaryAttribute: 'agi',
    attackType: 'Melee',
    roles: ['Carry'],
    imageUrl: 'https://example.com/antimage.png',
    iconUrl: 'https://example.com/antimage-icon.png',
    picks: 100,
    wins: 52,
    winRate: 0.52,
  },
  {
    id: 2,
    name: 'npc_dota_hero_axe',
    localizedName: 'Axe',
    primaryAttribute: 'str',
    attackType: 'Melee',
    roles: ['Initiator'],
    imageUrl: 'https://example.com/axe.png',
    iconUrl: 'https://example.com/axe-icon.png',
    picks: 80,
    wins: 40,
    winRate: 0.5,
  },
];

function response(value: unknown, modelVersion = 'gemini-3.5-flash-lite-001') {
  return {
    text: JSON.stringify(value),
    modelVersion,
  } as GenerateContentResponse;
}

describe('GeminiPhotoAdapter', () => {
  it('sends an inline image with a JSON schema and maps recognized heroes', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        quality: 'clear',
        recognized: [
          {
            side: 'enemy',
            slot: 0,
            heroName: 'Anti Mage',
            confidence: 0.96,
          },
          {
            side: 'unknown',
            slot: 1,
            heroName: 'Axe',
            confidence: 0.7,
          },
        ],
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xdb]);

    const result = await adapter.recognize(image, 'image/jpeg', heroes);

    expect(result).toEqual({
      quality: 'clear',
      recognized: [
        {
          side: 'enemy',
          slot: 0,
          heroId: 1,
          heroName: 'Anti Mage',
          localizedName: 'Anti-Mage',
          confidence: 0.96,
          needsReview: false,
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
      },
    });
    expect(JSON.stringify(request?.contents)).toContain('Anti-Mage, Axe');
    expect(JSON.stringify(request?.contents)).toContain(image.toString('base64'));
    expect(request?.config?.responseJsonSchema).toMatchObject({
      type: 'object',
      required: ['quality', 'recognized'],
    });
    expect(request?.config?.responseJsonSchema).not.toHaveProperty('$schema');
  });

  it('returns no picks when Gemini classifies the image as unrelated', async () => {
    const generateContent = vi
      .fn<(parameters: GenerateContentParameters) => Promise<GenerateContentResponse>>()
      .mockResolvedValue(response({
        quality: 'not_dota',
        recognized: [{
          side: 'enemy',
          slot: 0,
          heroName: 'Axe',
          confidence: 0.99,
        }],
      }));
    const adapter = new GeminiPhotoAdapter(config, { generateContent });

    const result = await adapter.recognize(Buffer.from('image'), 'image/png', heroes);

    expect(result.quality).toBe('not_dota');
    expect(result.recognized).toEqual([]);
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
      adapter.recognize(Buffer.from('image'), 'image/jpeg', heroes),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'IMAGE_RECOGNITION_FAILED',
      message: 'The recognition response was invalid',
    });
  });
});
