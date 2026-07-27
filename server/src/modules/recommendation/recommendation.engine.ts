import type { RankRequest, RecommendationFallbackReason, RecommendationResult } from './recommendation.types.js';
import {
  rankRecommendationPool,
  recommendationResultFromPool,
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

function isValidAdvisorOrder(order: number[], candidates: RecommendationCandidate[]) {
  if (order.length !== candidates.length || new Set(order).size !== order.length) {
    return false;
  }
  const allowed = new Set(candidates.map((candidate) => candidate.heroMeta.id));
  return order.every((heroId) => allowed.has(heroId));
}

export class RecommendationEngine {
  public constructor(private readonly advisor?: RecommendationAdvisor) {}

  public async recommend(request: RankRequest): Promise<RecommendationResult> {
    const candidates = rankRecommendationPool(request);
    if (candidates.length <= 3) {
      return this.fallback(request, candidates, 'insufficient_candidates');
    }
    if (!this.advisor?.configured) {
      return this.fallback(request, candidates, 'not_configured');
    }

    try {
      const advised = await this.advisor.advise({ request, candidates });
      if (!isValidAdvisorOrder(advised.orderedHeroIds, candidates)) {
        return this.fallback(request, candidates, 'invalid_response');
      }
      return recommendationResultFromPool(
        request,
        candidates,
        {
          engineVersion: 'hybrid-v2',
          scoringVersion: 'data-first-v2',
          aiAssisted: true,
          model: advised.model,
          promptVersion: advised.promptVersion,
        },
        advised.orderedHeroIds,
      );
    } catch (error) {
      const reason = error instanceof RecommendationAdvisorError
        ? error.reason
        : 'provider_error';
      return this.fallback(request, candidates, reason);
    }
  }

  private fallback(
    request: RankRequest,
    candidates: RecommendationCandidate[],
    fallbackReason: RecommendationFallbackReason,
  ) {
    return recommendationResultFromPool(request, candidates, {
      engineVersion: 'hybrid-v2',
      scoringVersion: 'data-first-v2',
      aiAssisted: false,
      ...(this.advisor?.model ? { model: this.advisor.model } : {}),
      fallbackReason,
    });
  }
}
