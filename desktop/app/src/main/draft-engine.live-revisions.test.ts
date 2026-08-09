import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NativeImage } from 'electron';

import type { Analysis, Preferences } from '../shared/contracts.js';
import type { ApiClient } from './api-client.js';
import { DraftEngine } from './draft-engine.js';
import { DesktopError } from './errors.js';
import type { GsiPayload, GsiReceiver } from './gsi.js';
import type { PreferencesStore } from './preferences-store.js';

const quota = {
  plan: 'free' as const,
  remaining: 2,
  limit: 3,
  nextRefillAt: null,
  planExpiresAt: null,
};

function frameImage(seed: number): NativeImage {
  const bitmap = Buffer.alloc(24 * 6 * 4);
  let value = seed;
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    const intensity = (value & 1) === 0 ? 16 : 240;
    bitmap[offset] = intensity;
    bitmap[offset + 1] = intensity;
    bitmap[offset + 2] = intensity;
    bitmap[offset + 3] = 255;
  }
  const image = {
    getSize: () => ({ width: 1600, height: 900 }),
    crop: () => image,
    resize: () => image,
    toBitmap: () => bitmap,
    toPNG: () => Buffer.from(`draft-frame-${seed}`),
    isEmpty: () => false,
  };
  return image as unknown as NativeImage;
}

function analysis(id: string, enemyHeroIds: number[]): Analysis {
  return {
    id,
    source: 'photo',
    input: {
      source: 'photo',
      position: 3,
      allyHeroIds: [],
      enemyHeroIds,
      bannedHeroIds: [],
    },
    result: {
      patch: '7.41',
      metaFetchedAt: '2026-08-08T00:00:00.000Z',
      recommendations: [2, 3, 4].map(heroId => ({
        hero: {
          id: heroId,
          name: `hero_${heroId}`,
          localizedName: `Hero ${heroId}`,
          imageUrl: `https://cdn.example.com/${heroId}.png`,
          iconUrl: `https://cdn.example.com/${heroId}-icon.png`,
          roles: ['Carry'],
        },
        score: 75,
        confidence: 'high',
        metrics: { roleFit: 0.8, counter: 0.7, meta: 0.6, synergy: 0.5 },
        reasons: ['strong_counter'],
      })),
    },
    createdAt: '2026-08-08T00:00:00.000Z',
  };
}

function recognition(enemyHeroIds: number[]) {
  return {
    quality: 'clear' as const,
    detectedPosition: null,
    model: 'test',
    recognized: enemyHeroIds.map((heroId, slot) => ({
      side: 'enemy' as const,
      slot,
      heroId,
      heroName: `hero_${heroId}`,
      localizedName: `Hero ${heroId}`,
      confidence: 0.99,
      needsReview: false,
    })),
  };
}

function completedResponse(
  id: string,
  enemyHeroIds: number[],
  frameRevision: number,
  liveRevision: number,
) {
  return {
    status: 'completed' as const,
    revision: frameRevision,
    frameHash: `${liveRevision + 1}`.repeat(64).slice(0, 64),
    quota,
    recognition: recognition(enemyHeroIds),
    analysis: analysis(id, enemyHeroIds),
    liveSession: {
      token: `desktop-live-${liveRevision}-${'t'.repeat(40)}`,
      revision: liveRevision,
      expiresAt: '2026-08-08T00:20:00.000Z',
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for Draft Vision');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function createEngine(api: ApiClient, capture: () => NativeImage) {
  const preferencesValue: Preferences = {
    theme: 'system',
    language: 'en',
    position: 3,
    rank: null,
    startWithWindows: false,
    minimizeToTray: true,
    overlayShortcut: 'PageUp',
    wishlist: [],
    assistantEnabled: false,
    assistantMode: 'vision',
    captureConsent: { accepted: true, acceptedAt: '2026-08-08T00:00:00.000Z' },
    overwolfConsent: { accepted: false, acceptedAt: null },
  };
  const preferences = {
    get: async () => structuredClone(preferencesValue),
    setAssistantEnabled: async () => structuredClone(preferencesValue),
  } as unknown as PreferencesStore;
  let listener: ((payload: GsiPayload) => void) | null = null;
  const gsi = {
    start: async (nextListener: (payload: GsiPayload) => void) => {
      listener = nextListener;
      nextListener({ map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' } });
      return { installed: true, configPath: null };
    },
    stop: async () => {
      listener = null;
    },
  } as unknown as GsiReceiver;
  return new DraftEngine(api, preferences, gsi, () => undefined, {
    captureDotaWindow: async () => capture(),
    captureIntervalMs: 25,
    captureDebounceMs: 1,
  });
}

describe('DraftEngine live photo revisions', () => {
  it('keeps one analysis through two, three, four and five picks and skips unchanged frames', async () => {
    let currentImage = frameImage(1);
    let createCalls = 0;
    let createSessionId: unknown = null;
    const revisionCalls: unknown[][] = [];
    const enemyDrafts = [
      [1, 5, 14],
      [1, 5, 14, 26],
      [1, 5, 14, 26, 75],
    ];
    const api = {
      analyzeDesktop: async (...arguments_: unknown[]) => {
        createCalls += 1;
        createSessionId = arguments_[3];
        return completedResponse('analysis-live', [1, 5], arguments_[4] as number, 0);
      },
      reviseDesktop: async (...arguments_: unknown[]) => {
        revisionCalls.push(arguments_);
        const enemies = enemyDrafts[revisionCalls.length - 1];
        return completedResponse(
          'analysis-live',
          enemies,
          arguments_[5] as number,
          revisionCalls.length,
        );
      },
    } as unknown as ApiClient;
    const engine = createEngine(api, () => currentImage);

    try {
      await engine.setEnabled(true);
      await waitFor(() => engine.getState().latestAnalysis?.input.enemyHeroIds.length === 2);
      await new Promise(resolve => setTimeout(resolve, 80));
      assert.equal(createCalls, 1);
      assert.equal(revisionCalls.length, 0);

      for (const [index, count] of [3, 4, 5].entries()) {
        currentImage = frameImage(index + 2);
        await waitFor(() => revisionCalls.length === index + 1);
        await waitFor(() => engine.getState().latestAnalysis?.input.enemyHeroIds.length === count);
      }

      assert.equal(createCalls, 1);
      assert.equal(revisionCalls.length, 3);
      assert.deepEqual(
        revisionCalls.map(call => call[0]),
        ['analysis-live', 'analysis-live', 'analysis-live'],
      );
      assert.deepEqual(
        revisionCalls.map(call => call[4]),
        [createSessionId, createSessionId, createSessionId],
      );
      assert.equal(engine.getState().latestAnalysisId, 'analysis-live');
    } finally {
      await engine.dispose();
    }
  });

  it('keeps the current capability when a changed frame contains the same normalized draft', async () => {
    let currentImage = frameImage(20);
    const revisionCalls: unknown[][] = [];
    const initialToken = `desktop-live-0-${'t'.repeat(40)}`;
    const api = {
      analyzeDesktop: async (...arguments_: unknown[]) => completedResponse(
        'analysis-same-draft',
        [1, 5],
        arguments_[4] as number,
        0,
      ),
      reviseDesktop: async (...arguments_: unknown[]) => {
        revisionCalls.push(arguments_);
        if (revisionCalls.length === 1) {
          const { liveSession: _liveSession, ...sameDraft } = completedResponse(
            'analysis-same-draft',
            [1, 5],
            arguments_[5] as number,
            0,
          );
          return sameDraft;
        }
        return completedResponse(
          'analysis-same-draft',
          [1, 5, 14],
          arguments_[5] as number,
          1,
        );
      },
    } as unknown as ApiClient;
    const engine = createEngine(api, () => currentImage);

    try {
      await engine.setEnabled(true);
      await waitFor(() => engine.getState().latestAnalysis?.input.enemyHeroIds.length === 2);
      currentImage = frameImage(21);
      await waitFor(() => revisionCalls.length === 1);
      assert.equal(engine.getState().latestAnalysisId, 'analysis-same-draft');

      currentImage = frameImage(22);
      await waitFor(() => revisionCalls.length === 2);
      await waitFor(() => engine.getState().latestAnalysis?.input.enemyHeroIds.length === 3);

      assert.equal(revisionCalls[0]?.[10], initialToken);
      assert.equal(revisionCalls[1]?.[10], initialToken);
      assert.equal(engine.getState().latestAnalysisId, 'analysis-same-draft');
    } finally {
      await engine.dispose();
    }
  });

  it('starts a fresh scoped session after capability expiry without logging out', async () => {
    let currentImage = frameImage(10);
    let createCalls = 0;
    let revisionCalls = 0;
    const api = {
      analyzeDesktop: async (...arguments_: unknown[]) => {
        createCalls += 1;
        return completedResponse(
          createCalls === 1 ? 'analysis-expired' : 'analysis-recovered',
          createCalls === 1 ? [1, 5] : [1, 5, 14],
          arguments_[4] as number,
          0,
        );
      },
      reviseDesktop: async () => {
        revisionCalls += 1;
        throw new DesktopError(
          'DESKTOP_LIVE_SESSION_INVALID',
          'The live analysis session is invalid or expired',
          401,
        );
      },
    } as unknown as ApiClient;
    const engine = createEngine(api, () => currentImage);

    try {
      await engine.setEnabled(true);
      await waitFor(() => engine.getState().latestAnalysisId === 'analysis-expired');
      currentImage = frameImage(11);
      await waitFor(() => revisionCalls === 1);
      await waitFor(() => engine.getState().latestAnalysisId === 'analysis-recovered');

      assert.equal(createCalls, 2);
      assert.equal(revisionCalls, 1);
      assert.equal(engine.getState().phase, 'ready');
    } finally {
      await engine.dispose();
    }
  });
});
