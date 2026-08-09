import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  recognitionPickKey,
  recognitionSideLabel,
} from '../renderer/recognition-presentation.ts';

const unknownPick = {
  side: 'unknown' as const,
  visualGroup: 'left' as const,
  slot: 2,
  heroId: 27,
  heroName: 'npc_dota_hero_shadow_shaman',
  localizedName: 'Shadow Shaman',
  confidence: 0.93,
  needsReview: true,
};

describe('recognition presentation', () => {
  it('never presents an unresolved visual group as an ally', () => {
    assert.equal(recognitionSideLabel(unknownPick, 'en'), 'Side unknown · left group');
    assert.equal(recognitionSideLabel(unknownPick, 'ru'), 'Сторона не определена · слева');
  });

  it('uses side evidence in the stable list key', () => {
    assert.equal(recognitionPickKey(unknownPick), 'unknown:left:2:27');
  });
});
