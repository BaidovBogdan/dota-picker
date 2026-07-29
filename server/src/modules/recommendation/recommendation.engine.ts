import type { RankRequest, RecommendationFallbackReason, RecommendationResult } from './recommendation.types.js';
import {
  rankRecommendations,
  type RecommendationCandidate,
} from './ranking.js';

export type RecommendationAdvisorInput = {
  request: RankRequest;
  candidates: RecommendationCandidate[];
};

export type RecommendationAdvisorOutput = {
  orderedHeroIds: number[];
  model: string;
  promptVersion: string;
};

export type RecommendationAdvisor = {
  readonly configured: boolean;
  readonly model: string;
  advise(input: RecommendationAdvisorInput): Promise<RecommendationAdvisorOutput>;
};

export class RecommendationAdvisorError extends Error {
  public constructor(
    public readonly reason: Exclude<RecommendationFallbackReason, 'not_configured' | 'insufficient_candidates'>,
    cause?: unknown,
  ) {
    super(`Recommendation advisor failed: ${reason}`, { cause });
    this.name = 'RecommendationAdvisorError';
  }
}

export class RecommendationEngine {
  public async recommend(request: RankRequest): Promise<RecommendationResult> {
    return rankRecommendations(request);
  }
}
