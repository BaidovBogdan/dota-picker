import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import type { HeroMeta, MetaSnapshot } from '../src/modules/heroes/heroes.types.js';
import {
  GeminiRecommendationAdvisor,
  RECOMMENDATION_PROMPT_VERSION,
} from '../src/modules/recommendation/gemini-recommendation.adapter.js';
import {
  type RecommendationAdvisorInput,
} from '../src/modules/recommendation/recommendation.engine.js';
import { rankRecommendationPool } from '../src/modules/recommendation/ranking.js';
import type { RankRequest } from '../src/modules/recommendation/recommendation.types.js';

const config = {
  apiKey: 'test-gemini-key',
  visionModel: 'gemini-3.5-flash-lite',
  recommendationModel: 'gemini-3.5-flash-lite',
  timeoutMs: 30_000,
  recommendationTimeoutMs: 50,
} as const;

function hero(id: number): HeroMeta {
  return {
    id,
    name: `hero_${id}`,
    localizedName: `Hero ${id}`,
    primaryAttribute: 'agi',
    attackType: 'Ranged',
    roles: ['Carry'],
    imageUrl: `https://example.com/${id}.png`,
    iconUrl: `https://example.com/${id}-icon.png`,
    picks: 10_000,
    wins: 5_000,
    winRate: 0.5,
  };
}

function advisorInput(): RecommendationAdvisorInput {
  const heroes = Array.from({ length: 10 }, (_, index) => hero(index + 1));
  const snapshot: MetaSnapshot = {
    heroes,
    patch: '7.41 · rolling matchups',
    fetchedAt: '2026-07-27T12:00:00.000Z',
    matchupByEnemy: new Map([
      [1, new Map(heroes.slice(1).map((candidate) => [
        candidate.id,
        {
          heroId: candidate.id,
          gamesPlayed: 500,
          wins: 250,
        },
      ]))],
    ]),
  };
  const request: RankRequest = {
    draft: {
      source: 'manual',
      position: 1,
      allyHeroIds: [],
      enemyHeroIds: [1],
    },
    snapshot,
  };
  return {
    request,
    candidates: rankRecommendationPool(request),
  };
}

function response(text: string): GenerateContentResponse {
  return {
    text,
    modelVersion: 'gemini-3.5-flash-lite-202607',
  } as unknown as GenerateContentResponse;
}

describe('GeminiRecommendationAdvisor', () => {
  it('sends a closed candidate enum and accepts a valid structured order', async () => {
    const input = advisorInput();
    const orderedHeroIds = input.candidates.map((candidate) => candidate.heroMeta.id).reverse();
    let captured: GenerateContentParameters | undefined;
    const generateContent = vi.fn(async (parameters: GenerateContentParameters) => {
      captured = parameters;
      return response(JSON.stringify({ orderedHeroIds }));
    });
    const advisor = new GeminiRecommendationAdvisor(config, { generateContent });

    const result = await advisor.advise(input);

    expect(result).toEqual({
      orderedHeroIds,
      model: 'gemini-3.5-flash-lite-202607',
      promptVersion: RECOMMENDATION_PROMPT_VERSION,
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
    const parameters = captured;
    expect(parameters?.config).not.toHaveProperty('temperature');
    expect(parameters?.config).not.toHaveProperty('topP');
    expect(parameters?.config?.responseMimeType).toBe('application/json');
    expect(parameters?.config?.responseJsonSchema).toMatchObject({
      properties: {
        orderedHeroIds: {
          items: {
            enum: input.candidates.map((candidate) => candidate.heroMeta.id),
          },
        },
      },
    });
  });

  it('classifies malformed model output as an invalid response', async () => {
    const generateContent = vi.fn(async () => response('not-json'));
    const advisor = new GeminiRecommendationAdvisor(config, { generateContent });

    await expect(advisor.advise(advisorInput())).rejects.toMatchObject({
      reason: 'invalid_response',
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('stops waiting for a hung provider without retrying', async () => {
    const generateContent = vi.fn(async () =>
      new Promise<GenerateContentResponse>(() => undefined));
    const advisor = new GeminiRecommendationAdvisor(
      { ...config, recommendationTimeoutMs: 5 },
      { generateContent },
    );

    await expect(advisor.advise(advisorInput())).rejects.toMatchObject({
      reason: 'timeout',
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
