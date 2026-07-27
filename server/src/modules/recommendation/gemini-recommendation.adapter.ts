import {
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import {
  RecommendationAdvisorError,
  type RecommendationAdvisor,
  type RecommendationAdvisorInput,
} from './recommendation.engine.js';

export const RECOMMENDATION_PROMPT_VERSION = 'counterpick-rerank-v1';

const advisorOutputSchema = z.object({
  orderedHeroIds: z.array(z.number().int().positive()).min(3).max(8),
}).strict();

type GeminiClient = {
  generateContent(parameters: GenerateContentParameters): Promise<GenerateContentResponse>;
};

function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === 'AbortError'
    || error.name === 'TimeoutError'
    || /deadline|timed?\s*out|timeout/iu.test(error.message);
}

function responseSchema(heroIds: number[]) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      orderedHeroIds: {
        type: 'array',
        items: {
          type: 'integer',
          enum: heroIds,
        },
        minItems: heroIds.length,
        maxItems: heroIds.length,
      },
    },
    required: ['orderedHeroIds'],
  };
}

function suppliedEvidence({ request, candidates }: RecommendationAdvisorInput) {
  const heroById = new Map(request.snapshot.heroes.map((hero) => [hero.id, hero]));
  const selectedHero = (heroId: number) => {
    const hero = heroById.get(heroId);
    return hero
      ? {
          id: hero.id,
          name: hero.localizedName,
          roles: hero.roles,
          attackType: hero.attackType,
        }
      : { id: heroId };
  };
  return {
    draft: {
      position: request.draft.position,
      rank: request.draft.rank ?? null,
      allies: request.draft.allyHeroIds.map(selectedHero),
      enemies: request.draft.enemyHeroIds.map(selectedHero),
      bannedHeroIds: request.draft.bannedHeroIds ?? [],
    },
    dataScope: {
      patchLabel: request.snapshot.patch,
      matchup: 'rolling_all_ranks',
      positionMeta: request.snapshot.positionMeta?.window ?? null,
      positionMetaRankFilter: request.snapshot.positionMeta?.rankFilter ?? null,
      positionMetaStale: request.snapshot.positionMeta?.isStale ?? null,
    },
    candidates: candidates.map((candidate) => ({
      heroId: candidate.heroMeta.id,
      name: candidate.heroMeta.localizedName,
      roles: candidate.heroMeta.roles,
      attackType: candidate.heroMeta.attackType,
      primaryAttribute: candidate.heroMeta.primaryAttribute,
      deterministicRank: candidate.deterministicRank + 1,
      deterministicScore: Math.round(candidate.baseScore * 10) / 10,
      metrics: candidate.recommendation.metrics,
      scoreBreakdown: candidate.recommendation.scoreBreakdown,
      evidence: candidate.recommendation.evidence,
    })),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new RecommendationAdvisorError('timeout'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export class GeminiRecommendationAdvisor implements RecommendationAdvisor {
  public readonly model: string;
  public readonly configured: boolean;
  private readonly client: GeminiClient | null;

  public constructor(
    private readonly config: AppConfig['gemini'],
    client?: GeminiClient,
  ) {
    this.model = config.recommendationModel;
    if (client) {
      this.client = client;
      this.configured = true;
      return;
    }
    if (!config.apiKey) {
      this.client = null;
      this.configured = false;
      return;
    }

    const sdk = new GoogleGenAI({
      apiKey: config.apiKey,
      httpOptions: {
        timeout: config.recommendationTimeoutMs,
        retryOptions: { attempts: 1 },
      },
    });
    this.client = {
      generateContent: async (parameters) => sdk.models.generateContent(parameters),
    };
    this.configured = true;
  }

  public async advise(input: RecommendationAdvisorInput) {
    if (!this.client) {
      throw new RecommendationAdvisorError('provider_error');
    }

    const heroIds = input.candidates.map((candidate) => candidate.heroMeta.id);
    const instructions = [
      `Prompt version: ${RECOMMENDATION_PROMPT_VERSION}.`,
      'You are a constrained Dota 2 counterpick ranking component.',
      'Use only the supplied JSON evidence and never use remembered hero abilities, counters, builds, patches, or other external game knowledge.',
      'Return every supplied candidate hero ID exactly once and never add a hero outside the supplied candidate list.',
      'Preserve deterministic ordering when score differences are meaningful.',
      'Only reorder close candidates when supplied role fit, team fit, enemy coverage, worst matchup, sample reliability, or recommendation diversity justifies it.',
      'Do not treat rolling all-rank matchup evidence as current-patch or rank-specific evidence.',
      'Output JSON only.',
    ].join(' ');

    try {
      const response = await withTimeout(
        this.client.generateContent({
          model: this.model,
          contents: [{
            role: 'user',
            parts: [{
              text: `${instructions}\n${JSON.stringify(suppliedEvidence(input))}`,
            }],
          }],
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: responseSchema(heroIds),
            maxOutputTokens: 512,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.MINIMAL,
            },
          },
        }),
        this.config.recommendationTimeoutMs,
      );
      if (!response.text) {
        throw new RecommendationAdvisorError('invalid_response');
      }
      let value: unknown;
      try {
        value = JSON.parse(response.text);
      } catch {
        throw new RecommendationAdvisorError('invalid_response');
      }
      const parsed = advisorOutputSchema.safeParse(value);
      if (!parsed.success) {
        throw new RecommendationAdvisorError('invalid_response');
      }
      return {
        orderedHeroIds: parsed.data.orderedHeroIds,
        model: response.modelVersion ?? this.model,
        promptVersion: RECOMMENDATION_PROMPT_VERSION,
      };
    } catch (error) {
      if (error instanceof RecommendationAdvisorError) {
        throw error;
      }
      throw new RecommendationAdvisorError(
        isTimeoutError(error) ? 'timeout' : 'provider_error',
        error,
      );
    }
  }
}
