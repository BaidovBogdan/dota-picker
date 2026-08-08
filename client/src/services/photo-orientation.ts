import type { NeutralRecognizedPick } from '@/types/domain';

export type VisualGroup = 'left' | 'right';

type PhotoReviewOwner = {
  userId: string | null | undefined;
  guestId: string | null | undefined;
};

type PhotoReviewContext = PhotoReviewOwner & {
  photoUri: string | null;
};

export type PhotoOrientationError =
  'missing_groups' | 'duplicate_hero' | 'too_many_allies' | 'too_many_enemies';

type PhotoOrientationResult =
  | {
      ok: true;
      allies: number[];
      enemies: number[];
      resolved: NeutralRecognizedPick[];
      remaining: NeutralRecognizedPick[];
    }
  | { ok: false; error: PhotoOrientationError };

function ownerKey({ userId, guestId }: PhotoReviewOwner) {
  if (userId) return `user:${userId}`;
  if (guestId) return `guest:${guestId}`;
  return null;
}

export function canRestorePhotoDraft(launch: PhotoReviewContext, current: PhotoReviewContext) {
  const launchOwner = ownerKey(launch);
  return (
    launchOwner !== null &&
    launchOwner === ownerKey(current) &&
    launch.photoUri !== null &&
    launch.photoUri === current.photoUri
  );
}

export function withoutOrientedPicks(
  picks: NeutralRecognizedPick[],
  allies: number[],
  enemies: number[],
) {
  const orientedIds = new Set(picks.flatMap((pick) => (pick.heroId === null ? [] : [pick.heroId])));
  return {
    allies: allies.filter((heroId) => !orientedIds.has(heroId)),
    enemies: enemies.filter((heroId) => !orientedIds.has(heroId)),
  };
}

export function activeOrientedPicks(
  picks: NeutralRecognizedPick[],
  allyGroup: VisualGroup,
  allies: number[],
  enemies: number[],
) {
  const allyIds = new Set(allies);
  const enemyIds = new Set(enemies);

  return picks.filter((pick) => {
    if (pick.heroId === null || pick.visualGroup === undefined) return false;
    const expectedTeam = pick.visualGroup === allyGroup ? allyIds : enemyIds;
    return expectedTeam.has(pick.heroId);
  });
}

export function orientRecognizedPicks(
  picks: NeutralRecognizedPick[],
  allyGroup: VisualGroup,
  baseAllies: number[],
  baseEnemies: number[],
): PhotoOrientationResult {
  const resolved = picks.filter(
    (pick): pick is NeutralRecognizedPick & { heroId: number; visualGroup: VisualGroup } =>
      pick.heroId !== null && pick.visualGroup !== undefined,
  );
  if (resolved.length === 0) return { ok: false, error: 'missing_groups' };

  const occupied = new Set([...baseAllies, ...baseEnemies]);
  const seen = new Set<number>();
  for (const pick of resolved) {
    if (occupied.has(pick.heroId) || seen.has(pick.heroId)) {
      return { ok: false, error: 'duplicate_hero' };
    }
    seen.add(pick.heroId);
  }

  const orientedAllies = resolved
    .filter((pick) => pick.visualGroup === allyGroup)
    .map((pick) => pick.heroId);
  const orientedEnemies = resolved
    .filter((pick) => pick.visualGroup !== allyGroup)
    .map((pick) => pick.heroId);
  const allies = [...baseAllies, ...orientedAllies];
  const enemies = [...baseEnemies, ...orientedEnemies];
  if (allies.length > 4) return { ok: false, error: 'too_many_allies' };
  if (enemies.length > 5) return { ok: false, error: 'too_many_enemies' };

  const resolvedSet = new Set<NeutralRecognizedPick>(resolved);
  return {
    ok: true,
    allies,
    enemies,
    resolved,
    remaining: picks.filter((pick) => !resolvedSet.has(pick)),
  };
}
