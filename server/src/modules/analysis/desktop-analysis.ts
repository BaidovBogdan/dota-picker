import type { PhotoRecognitionResult } from '../photo/photo-recognizer.js';
import { draftSchema } from '../recommendation/recommendation.schemas.js';
import type { DraftInput } from '../recommendation/recommendation.types.js';

export type DesktopWaitingReason =
  | 'not_dota_draft'
  | 'image_unclear'
  | 'uncertain_picks'
  | 'insufficient_enemy_picks';

export type DesktopDraftDecision =
  | { status: 'waiting'; reason: DesktopWaitingReason }
  | { status: 'ready'; draft: DraftInput };

export function resolveDesktopPosition(
  recognition: PhotoRecognitionResult,
  requestedPosition: 1 | 2 | 3 | 4 | 5,
  autoPosition: boolean,
): 1 | 2 | 3 | 4 | 5 {
  return autoPosition
    ? recognition.detectedPosition ?? requestedPosition
    : requestedPosition;
}

export function createDesktopDraft(
  recognition: PhotoRecognitionResult,
  position: 1 | 2 | 3 | 4 | 5,
  rank?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
): DesktopDraftDecision {
  if (recognition.quality === 'not_dota') {
    return { status: 'waiting', reason: 'not_dota_draft' };
  }
  if (
    recognition.quality === 'too_blurry'
  ) {
    return { status: 'waiting', reason: 'image_unclear' };
  }

  const trustedEntries = recognition.recognized.filter((entry) => (
    entry.heroId !== null
    && entry.side !== 'unknown'
    && !entry.needsReview
  ));
  if (trustedEntries.length === 0) {
    return {
      status: 'waiting',
      reason: recognition.quality === 'partial' ? 'image_unclear' : 'uncertain_picks',
    };
  }
  if (trustedEntries.some((entry) => entry.confidence < 0.7)) {
    return { status: 'waiting', reason: 'uncertain_picks' };
  }

  const allyHeroIds = trustedEntries
    .filter((entry) => entry.side === 'ally')
    .map((entry) => entry.heroId)
    .filter((heroId): heroId is number => heroId !== null);
  const enemyHeroIds = trustedEntries
    .filter((entry) => entry.side === 'enemy')
    .map((entry) => entry.heroId)
    .filter((heroId): heroId is number => heroId !== null);
  const allHeroIds = [...allyHeroIds, ...enemyHeroIds];

  if (
    allyHeroIds.length > 4
    || enemyHeroIds.length > 5
    || new Set(allHeroIds).size !== allHeroIds.length
  ) {
    return { status: 'waiting', reason: 'uncertain_picks' };
  }
  if (enemyHeroIds.length < 2) {
    return { status: 'waiting', reason: 'insufficient_enemy_picks' };
  }

  const parsed = draftSchema.safeParse({
    source: 'photo',
    position,
    allyHeroIds,
    enemyHeroIds,
    bannedHeroIds: [],
    ...(rank === undefined ? {} : { rank }),
  });
  return parsed.success
    ? { status: 'ready', draft: parsed.data }
    : { status: 'waiting', reason: 'uncertain_picks' };
}
