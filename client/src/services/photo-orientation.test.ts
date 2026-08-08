import { describe, expect, it } from 'vitest';

import type { NeutralRecognizedPick } from '@/types/domain';

import {
  activeOrientedPicks,
  canRestorePhotoDraft,
  orientRecognizedPicks,
  type VisualGroup,
  withoutOrientedPicks,
} from './photo-orientation';

function pick(
  heroId: number | null,
  visualGroup: VisualGroup | undefined,
  slot: number,
): NeutralRecognizedPick {
  return {
    heroId,
    name: heroId === null ? 'Unknown' : `Hero ${heroId}`,
    ...(visualGroup ? { visualGroup } : {}),
    slot,
    confidence: 0.9,
    needsReview: true,
  };
}

describe('photo orientation', () => {
  it('restores a cancelled photo draft only in the original owner and photo context', () => {
    const launch = { userId: 'user-1', guestId: null, photoUri: 'file://draft.png' };

    expect(canRestorePhotoDraft(launch, launch)).toBe(true);
    expect(canRestorePhotoDraft(launch, { ...launch, userId: 'user-2' })).toBe(false);
    expect(canRestorePhotoDraft(launch, { ...launch, photoUri: 'file://new.png' })).toBe(false);
  });

  it('assigns both visual groups while preserving existing draft picks', () => {
    const result = orientRecognizedPicks(
      [pick(10, 'left', 0), pick(20, 'right', 0), pick(null, undefined, 1)],
      'left',
      [1],
      [2],
    );

    expect(result).toEqual({
      ok: true,
      allies: [1, 10],
      enemies: [2, 20],
      resolved: [pick(10, 'left', 0), pick(20, 'right', 0)],
      remaining: [pick(null, undefined, 1)],
    });
  });

  it('preserves later manual changes when the user swaps the orientation', () => {
    const oriented = [pick(10, 'left', 0), pick(20, 'right', 0)];
    const base = withoutOrientedPicks(oriented, [1, 10, 99], [2, 20]);
    const result = orientRecognizedPicks(oriented, 'right', base.allies, base.enemies);

    expect(result).toMatchObject({
      ok: true,
      allies: [1, 99, 20],
      enemies: [2, 10],
    });
  });

  it('does not resurrect a recognized hero that the user replaced manually', () => {
    const oriented = [pick(10, 'left', 0), pick(20, 'right', 0)];
    const active = activeOrientedPicks(oriented, 'left', [1, 99], [2, 20]);
    const base = withoutOrientedPicks(active, [1, 99], [2, 20]);
    const result = orientRecognizedPicks(active, 'right', base.allies, base.enemies);

    expect(active).toEqual([pick(20, 'right', 0)]);
    expect(result).toMatchObject({
      ok: true,
      allies: [1, 99, 20],
      enemies: [2],
    });
  });

  it('rejects an ally group that includes all five players', () => {
    const result = orientRecognizedPicks(
      [1, 2, 3, 4, 5].map((heroId, slot) => pick(heroId, 'left', slot)),
      'left',
      [],
      [],
    );

    expect(result).toEqual({ ok: false, error: 'too_many_allies' });
  });

  it('rejects duplicate heroes across recognized and existing picks', () => {
    const result = orientRecognizedPicks([pick(10, 'left', 0)], 'left', [10], []);

    expect(result).toEqual({ ok: false, error: 'duplicate_hero' });
  });
});
