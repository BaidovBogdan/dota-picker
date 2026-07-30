import { describe, expect, it } from 'vitest';
import { createDesktopDraft } from '../src/modules/analysis/desktop-analysis.js';
import type { PhotoRecognitionResult } from '../src/modules/photo/photo-recognizer.js';

const trustedEnemy: PhotoRecognitionResult['recognized'][number] = {
  side: 'enemy',
  slot: 0,
  heroId: 1,
  heroName: 'Anti-Mage',
  localizedName: 'Anti-Mage',
  confidence: 0.99,
  needsReview: false,
};

function recognition(
  overrides: Partial<PhotoRecognitionResult> = {},
): PhotoRecognitionResult {
  return {
    quality: 'clear',
    model: 'test-model',
    recognized: [{ ...trustedEnemy }],
    ...overrides,
  };
}

describe('desktop draft decision', () => {
  it('creates a backward-compatible photo draft from trusted picks', () => {
    const result = createDesktopDraft(
      recognition({
        recognized: [
          {
            side: 'ally',
            slot: 0,
            heroId: 2,
            heroName: 'Axe',
            localizedName: 'Axe',
            confidence: 0.99,
            needsReview: false,
          },
          {
            side: 'enemy',
            slot: 0,
            heroId: 1,
            heroName: 'Anti-Mage',
            localizedName: 'Anti-Mage',
            confidence: 0.99,
            needsReview: false,
          },
          {
            side: 'enemy',
            slot: 1,
            heroId: 3,
            heroName: 'Bane',
            localizedName: 'Bane',
            confidence: 0.99,
            needsReview: false,
          },
        ],
      }),
      3,
      7,
    );

    expect(result).toEqual({
      status: 'ready',
      draft: {
        source: 'photo',
        position: 3,
        allyHeroIds: [2],
        enemyHeroIds: [1, 3],
        bannedHeroIds: [],
        rank: 7,
      },
    });
  });

  it.each([
    ['not_dota', 'not_dota_draft'],
    ['too_blurry', 'image_unclear'],
    ['partial', 'image_unclear'],
  ] as const)('waits for an actionable %s frame', (quality, reason) => {
    expect(createDesktopDraft(recognition({ quality }), 2)).toEqual({
      status: 'waiting',
      reason,
    });
  });

  it.each([
    {
      side: 'unknown' as const,
      heroId: 1,
      needsReview: false,
    },
    {
      side: 'enemy' as const,
      heroId: null,
      needsReview: true,
    },
    {
      side: 'enemy' as const,
      heroId: 1,
      needsReview: true,
    },
  ])('does not analyze an uncertain pick', (entry) => {
    const result = createDesktopDraft(
      recognition({
        recognized: [{
          ...trustedEnemy,
          ...entry,
        }],
      }),
      2,
    );

    expect(result).toEqual({
      status: 'waiting',
      reason: 'uncertain_picks',
    });
  });

  it('waits until at least two trusted enemies are visible', () => {
    const ally = {
      ...trustedEnemy,
      side: 'ally' as const,
    };

    expect(createDesktopDraft(
      recognition({ recognized: [ally] }),
      4,
    )).toEqual({
      status: 'waiting',
      reason: 'insufficient_enemy_picks',
    });
    expect(createDesktopDraft(
      recognition({ recognized: [trustedEnemy] }),
      4,
    )).toEqual({
      status: 'waiting',
      reason: 'insufficient_enemy_picks',
    });
  });

  it('rejects duplicate heroes and oversized teams before analysis', () => {
    const enemy = trustedEnemy;
    const duplicate = {
      ...enemy,
      side: 'ally' as const,
    };
    expect(createDesktopDraft(
      recognition({ recognized: [enemy, duplicate] }),
      1,
    )).toEqual({
      status: 'waiting',
      reason: 'uncertain_picks',
    });

    const allies = Array.from({ length: 5 }, (_, slot) => ({
      ...enemy,
      side: 'ally' as const,
      slot,
      heroId: slot + 10,
    }));
    expect(createDesktopDraft(
      recognition({ recognized: [...allies, enemy] }),
      1,
    )).toEqual({
      status: 'waiting',
      reason: 'uncertain_picks',
    });
  });
});
