import { createDesktopDraft, resolveDesktopPosition } from './desktop-analysis.js';
import type { PhotoRecognitionResult } from '../photo/photo-recognizer.js';

const consensusMemoryMs = 18_000;
const stickyMemoryMs = 9_000;
const slotWindowMs = 9_000;
const minQualityBoost = 0.24;
const minStableScore = 0.9;
const minSlotAppearances = 2;
const minSlotMargin = 0.18;

type RecognitionSlotSide = 'ally' | 'enemy';
type DraftPosition = 1 | 2 | 3 | 4 | 5;
type DesktopConsensusResult = {
  recognition: PhotoRecognitionResult;
  decision: ReturnType<typeof createDesktopDraft>;
  resolvedPosition: DraftPosition;
};

type StableEntry = {
  heroId: number;
  heroName: string;
  localizedName: string;
  score: number;
  appearances: number;
  lastSeenFrame: number;
  lastSeenAt: number;
  lastConfidence: number;
};

type SlotState = {
  candidates: Map<number, StableEntry>;
  lastTouchAt: number;
  stableHeroId: number | null;
};

type SessionState = {
  sessionId: string;
  autoPosition: boolean;
  requestedPosition: DraftPosition;
  rank: number | null;
  resolvedPosition: DraftPosition;
  slots: Map<string, SlotState>;
  lastSeenAt: number;
};

type StabilizeInput = {
  sessionId: string;
  revision: number;
  autoPosition: boolean;
  requestedPosition: DraftPosition;
  rank: number | null;
  recognition: PhotoRecognitionResult;
};

const qualityWeight = {
  clear: 1,
  partial: 0.77,
  too_blurry: 0.24,
  not_dota: 0,
} as const;

function makeSessionKey(input: StabilizeInput) {
  return `${input.sessionId}|${input.autoPosition ? 1 : 0}|${input.requestedPosition}|${input.rank ?? 'null'}`;
}

function slotKey(side: RecognitionSlotSide, slot: number) {
  return `${side}:${slot}`;
}

function decayScore(score: number, elapsedMs: number) {
  if (elapsedMs <= 0) return score;
  if (elapsedMs >= consensusMemoryMs) return 0;
  const factor = Math.exp(-elapsedMs / (consensusMemoryMs / Math.log(2)));
  return score * Math.min(1, Math.max(0, factor));
}

function pickLatestBySlot(recognition: PhotoRecognitionResult) {
  const bySlot = new Map<string, PhotoRecognitionResult['recognized'][number]>();
  for (const entry of recognition.recognized) {
    if (
      entry.side === 'unknown'
      || entry.heroId === null
      || entry.needsReview
    ) {
      continue;
    }
    const key = `${entry.side}:${entry.slot}`;
    const existing = bySlot.get(key);
    if (!existing || entry.confidence > existing.confidence) {
      bySlot.set(key, entry);
    }
  }
  return [...bySlot.values()];
}

function stableHero(
  state: SlotState,
  frame: number,
  now: number,
) {
  const candidates = [...state.candidates.values()]
    .filter((candidate) => now - candidate.lastSeenAt <= slotWindowMs)
    .map((candidate) => ({
      ...candidate,
      score: decayScore(candidate.score, now - candidate.lastSeenAt),
    }))
    .sort((left, right) => {
      const scoreDiff = right.score - left.score;
      if (scoreDiff !== 0) return scoreDiff;
      return right.lastConfidence - left.lastConfidence;
    });

  if (candidates.length === 0) {
    return { heroId: null, reason: 'no_signal' as const };
  }

  const best = candidates[0];
  const second = candidates[1];
  if (!best) {
    return { heroId: null, reason: 'no_signal' as const };
  }

  const secondScore = second?.score ?? 0;
  const appearsStrong = best.appearances >= minSlotAppearances;
  const singleFrameStrong = frame === best.lastSeenFrame && best.lastConfidence >= 0.97;
  const hasMargin = (best.score - secondScore) >= minSlotMargin;
  const qualifies = best.score >= minStableScore && (appearsStrong || singleFrameStrong) && hasMargin;

  if (qualifies) {
    state.stableHeroId = best.heroId;
    state.lastTouchAt = now;
    return { heroId: best.heroId, entry: best };
  }

  if (
    state.stableHeroId !== null
    && now - state.lastTouchAt <= stickyMemoryMs
  ) {
    const sticky = state.candidates.get(state.stableHeroId);
    if (sticky) {
      return { heroId: sticky.heroId, entry: sticky };
    }
  }

  return { heroId: null, reason: 'unstable' as const };
}

function pruneSlots(session: SessionState, now: number) {
  for (const [key, slot] of session.slots) {
    if (now - slot.lastTouchAt > slotWindowMs * 2) {
      session.slots.delete(key);
      continue;
    }
    for (const [heroId, candidate] of slot.candidates) {
      if (now - candidate.lastSeenAt > consensusMemoryMs) {
        slot.candidates.delete(heroId);
      } else {
        const decayed = decayScore(candidate.score, now - candidate.lastSeenAt);
        if (decayed <= minQualityBoost) {
          slot.candidates.delete(heroId);
          continue;
        }
        slot.candidates.set(heroId, {
          ...candidate,
          score: decayed,
        });
      }
    }
    if (slot.candidates.size === 0) {
      session.slots.delete(key);
    }
  }
}

export class DesktopConsensusTracker {
  private readonly sessions = new Map<string, SessionState>();
  private readonly keyBySession = new Map<string, Set<string>>();

  private getSessionState(input: StabilizeInput): SessionState {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (now - session.lastSeenAt > 90_000) {
        this.sessions.delete(key);
        for (const keys of this.keyBySession.values()) {
          keys.delete(key);
        }
      }
    }
    const key = makeSessionKey(input);
    const session = this.sessions.get(key);
    if (session) {
      return session;
    }
    const created = this.createSession(input);
    this.sessions.set(key, created);
    const current = this.keyBySession.get(input.sessionId) ?? new Set<string>();
    current.add(key);
    this.keyBySession.set(input.sessionId, current);
    return created;
  }

  public stabilize(input: StabilizeInput): DesktopConsensusResult {
    const now = Date.now();
    const key = makeSessionKey(input);
    const session = this.getSessionState(input);

    if (input.autoPosition && input.recognition.detectedPosition) {
      session.resolvedPosition = input.recognition.detectedPosition;
    }

    this.pruneAndTouch(session, now);

    if (input.recognition.quality === 'not_dota' || input.recognition.quality === 'too_blurry') {
      const partialRecognition = this.buildStableRecognition(session, input, now);
      const position = resolveDesktopPosition(partialRecognition, input.requestedPosition, input.autoPosition);
      const decision = createDesktopDraft(
        partialRecognition,
        position,
        input.rank ?? undefined,
      );
      return {
        recognition: partialRecognition,
        decision,
        resolvedPosition: position,
      };
    }

    session.autoPosition = input.autoPosition;
    session.requestedPosition = input.requestedPosition;
    session.rank = input.rank;
    session.lastSeenAt = now;

    const candidates = pickLatestBySlot(input.recognition);
    for (const candidate of candidates) {
      const keySlot = slotKey(candidate.side, candidate.slot);
      const slot = session.slots.get(keySlot) ?? {
        candidates: new Map<number, StableEntry>(),
        lastTouchAt: now,
        stableHeroId: null,
      };
      const tracked = slot.candidates.get(candidate.heroId) ?? {
        heroId: candidate.heroId,
        heroName: candidate.heroName,
        localizedName: candidate.localizedName,
        score: 0,
        appearances: 0,
        lastSeenFrame: input.revision,
        lastSeenAt: now,
        lastConfidence: candidate.confidence,
      };

      if (tracked.lastSeenFrame !== input.revision) {
        tracked.appearances += 1;
      }
      const baseScore = tracked.score + (candidate.confidence * qualityWeight[input.recognition.quality]);
      tracked.score = baseScore * 0.75 + tracked.score * 0.25;
      tracked.lastSeenFrame = input.revision;
      tracked.lastSeenAt = now;
      tracked.lastConfidence = candidate.confidence;
      slot.candidates.set(candidate.heroId, tracked);
      slot.lastTouchAt = now;
      session.slots.set(keySlot, slot);
    }

    const stable = this.buildStableRecognition(session, input, now);
    const position = resolveDesktopPosition(stable, input.requestedPosition, input.autoPosition);
    const decision = createDesktopDraft(
      stable,
      position,
      input.rank ?? undefined,
    );

    return {
      recognition: stable,
      decision,
      resolvedPosition: position,
    };
  }

  private createSession(input: StabilizeInput): SessionState {
    return {
      sessionId: input.sessionId,
      autoPosition: input.autoPosition,
      requestedPosition: input.requestedPosition,
      rank: input.rank,
      resolvedPosition: input.requestedPosition,
      slots: new Map(),
      lastSeenAt: Date.now(),
    };
  }

  private pruneAndTouch(session: SessionState, now: number) {
    pruneSlots(session, now);
    session.lastSeenAt = now;
  }

  private buildStableRecognition(
    session: SessionState,
    input: StabilizeInput,
    now: number,
  ) {
    this.pruneAndTouch(session, now);
    const stableEntries: PhotoRecognitionResult['recognized'] = [];
    for (const [key, slot] of session.slots) {
      const [side, slotName] = key.split(':');
      const result = stableHero(slot, input.revision, now);
      if (!result.heroId || !result.entry) continue;
      stableEntries.push({
        side: side as RecognitionSlotSide,
        slot: Number(slotName),
        heroId: result.entry.heroId,
        heroName: result.entry.heroName,
        localizedName: result.entry.localizedName,
        confidence: Math.min(1, Math.max(0.1, result.entry.lastConfidence)),
        needsReview: false,
      });
    }

    const shouldPreserveDetected = input.autoPosition && input.recognition.detectedPosition;
    return {
      ...input.recognition,
      recognized: stableEntries.sort((left, right) => (
        left.side.localeCompare(right.side) || left.slot - right.slot
      )),
      detectedPosition: shouldPreserveDetected
        ? input.recognition.detectedPosition
        : null,
    };
  }
}
