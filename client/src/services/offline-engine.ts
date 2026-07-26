import { fallbackHeroes, heroById } from '@/data/heroes';
import { translate } from '@/i18n';
import type { AnalysisResult, Draft, Hero, Position } from '@/types/domain';
import { createId } from '@/utils/id';

const counters: Record<number, number[]> = {
  1: [104, 2, 82],
  2: [70, 54, 47],
  14: [93, 54, 70],
  41: [79, 42, 50],
  44: [2, 15, 98],
  59: [68, 47, 36],
  74: [88, 13, 126],
  94: [1, 88, 26],
  99: [47, 104, 54],
};

const defaults: Record<Position, number[]> = {
  1: [70, 54, 8, 41, 93],
  2: [13, 47, 39, 126, 74],
  3: [2, 98, 104, 29, 96],
  4: [88, 7, 86, 100, 20],
  5: [68, 50, 79, 111, 5],
};

const labels = ['best', 'reliable', 'fallback'] as const;

const scoreHero = (hero: Hero, draft: Draft, position: Position) => {
  let score = hero.positions.includes(position) ? 34 : 0;
  draft.enemies.forEach((enemyId) => {
    if (counters[enemyId]?.includes(hero.id)) score += 22;
  });
  if (defaults[position].includes(hero.id)) score += 12;
  if (draft.allies.some((id) => heroById.get(id)?.attribute === hero.attribute)) score -= 3;
  return score;
};

export function analyzeOffline(draft: Draft): AnalysisResult {
  if (!draft.position || draft.enemies.length === 0) {
    throw new Error(translate('errors.validationDraft'));
  }

  const excluded = new Set([...draft.allies, ...draft.enemies]);
  const ranked = fallbackHeroes
    .filter((hero) => !excluded.has(hero.id) && hero.positions.includes(draft.position as Position))
    .map((hero) => ({ hero, score: scoreHero(hero, draft, draft.position as Position) }))
    .sort((a, b) => b.score - a.score || a.hero.name.localeCompare(b.hero.name))
    .slice(0, 3);

  const createdAt = new Date().toISOString();

  return {
    id: createId('analysis'),
    draft: { ...draft, allies: [...draft.allies], enemies: [...draft.enemies] },
    recommendations: ranked.map(({ hero, score }, index) => ({
      hero,
      score: Math.min(96, Math.max(63, score + 42 - index * 3)),
      label: labels[index] ?? 'fallback',
      reasons: [
        `i18n:recommendation.reason.position|${draft.position as Position}`,
        draft.enemies.some((enemy) => counters[enemy]?.includes(hero.id))
          ? 'i18n:recommendation.reason.keyMatchup'
          : 'i18n:recommendation.reason.stableTempo',
      ],
      risks: ['i18n:recommendation.risk.comfort'],
      laneFit: draft.rank
        ? `i18n:recommendation.lane.adapted|${draft.rank}`
        : 'i18n:recommendation.lane.offline',
    })),
    patch: 'i18n:recommendation.patch.offline',
    confidence: 'low',
    dataUpdatedAt: createdAt,
    createdAt,
    source: 'offline',
  };
}
