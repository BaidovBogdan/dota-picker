import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NativeImage } from 'electron';

import type { Analysis, EngineState, Preferences } from '../shared/contracts.js';
import type { ApiClient } from './api-client.js';
import type { DiagnosticEventDraft } from './diagnostics.js';
import { DraftEngine } from './draft-engine.js';
import { draftImage } from './draft-frame-fingerprint.fixture.js';
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

function recognizedPick(
  side: 'ally' | 'enemy',
  visualGroup: 'left' | 'right',
  slot: number,
  heroId: number,
) {
  return {
    side,
    visualGroup,
    slot,
    heroId,
    heroName: `hero_${heroId}`,
    localizedName: `Hero ${heroId}`,
    confidence: 0.99,
    needsReview: false,
  };
}

function recognition(enemyIds: number[]) {
  return {
    quality: 'clear' as const,
    detectedPosition: null,
    model: 'freshness-test',
    recognized: [
      recognizedPick('ally', 'left', 0, 11),
      recognizedPick('ally', 'left', 1, 22),
      ...enemyIds.map((heroId, slot) => recognizedPick('enemy', 'right', slot, heroId)),
    ],
  };
}

function analysis(id: string, enemyIds: number[]): Analysis {
  return {
    id,
    source: 'photo',
    input: {
      source: 'photo',
      position: 3,
      allyHeroIds: [11, 22],
      enemyHeroIds: enemyIds,
      bannedHeroIds: [],
    },
    result: {
      patch: '7.41',
      metaFetchedAt: '2026-08-09T00:00:00.000Z',
      recommendations: [1, 2, 3].map((heroId) => ({
        hero: {
          id: heroId,
          name: `hero_${heroId}`,
          localizedName: `Hero ${heroId}`,
          imageUrl: `https://cdn.example.com/${heroId}.png`,
          iconUrl: `https://cdn.example.com/${heroId}-icon.png`,
          roles: ['Carry'],
        },
        score: 75,
        confidence: 'high' as const,
        metrics: { roleFit: 0.8, counter: 0.7, meta: 0.6, synergy: 0.5 },
        reasons: ['strong_counter'],
      })),
    },
    createdAt: '2026-08-09T00:00:00.000Z',
  };
}

function waitingResponse(revision: number) {
  return {
    status: 'waiting' as const,
    reason: 'insufficient_enemy_picks' as const,
    revision,
    frameHash: 'a'.repeat(64),
    quota,
    recognition: recognition([]),
  };
}

function completedResponse(id: string, enemyIds: number[], revision: number, liveRevision = 0) {
  return {
    status: 'completed' as const,
    revision,
    frameHash: 'b'.repeat(64),
    quota,
    recognition: recognition(enemyIds),
    analysis: analysis(id, enemyIds),
    liveSession: {
      token: `freshness-${liveRevision}-${'t'.repeat(40)}`,
      revision: liveRevision,
      expiresAt: '2026-08-09T00:20:00.000Z',
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for Draft Vision freshness');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function createEngine(
  api: ApiClient,
  capture: (thumbnailSize: { width: number; height: number }) => NativeImage,
  emissions: EngineState[] = [],
  diagnostics: DiagnosticEventDraft[] = [],
  gsiListeners: Array<(payload: GsiPayload) => void> = [],
) {
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
    captureConsent: { accepted: true, acceptedAt: '2026-08-09T00:00:00.000Z' },
    overwolfConsent: { accepted: false, acceptedAt: null },
    diagnosticsConsent: { accepted: false, acceptedAt: null, version: null },
  };
  const preferences = {
    get: async () => structuredClone(preferencesValue),
    setAssistantEnabled: async () => structuredClone(preferencesValue),
  } as unknown as PreferencesStore;
  const gsi = {
    start: async (listener: (payload: GsiPayload) => void) => {
      gsiListeners.push(listener);
      listener({ map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' } });
      return { installed: true, configPath: null };
    },
    stop: async () => undefined,
  } as unknown as GsiReceiver;
  return new DraftEngine(api, preferences, gsi, (state) => emissions.push(state), {
    captureDotaWindow: async (thumbnailSize) => capture(thumbnailSize),
    captureIntervalMs: 25,
    captureDebounceMs: 1,
    diagnostic: (event) => diagnostics.push(structuredClone(event)),
  });
}

describe('DraftEngine frame freshness', () => {
  it('correlates one frame decision, request, and recognition under one revision', async () => {
    const diagnostics: DiagnosticEventDraft[] = [];
    const image = draftImage([11, 22, 0, 0, 0, 33, 44, 0, 0, 0]);
    const api = {
      analyzeDesktop: async (...arguments_: unknown[]) => (
        completedResponse('correlated-analysis', [33, 44], arguments_[4] as number)
      ),
    } as unknown as ApiClient;
    const engine = createEngine(api, () => image, [], diagnostics);

    try {
      await engine.setEnabled(true);
      await waitFor(() => engine.getState().phase === 'ready');
      const capture = diagnostics.find((event) => event.type === 'capture_decision');
      const request = diagnostics.find((event) => event.type === 'request_started');
      const recognitionEvent = diagnostics.find((event) => event.type === 'recognition_result');
      assert.ok(capture?.type === 'capture_decision');
      assert.ok(request?.type === 'request_started');
      assert.ok(recognitionEvent?.type === 'recognition_result');
      assert.equal(capture.details.revision, request.details.revision);
      assert.equal(recognitionEvent.details.revision, request.details.revision);
    } finally {
      await engine.dispose();
    }
  });

  it('correlates freshness with the submitted upload instead of the earlier watch capture', async () => {
    const watchImage = draftImage([11, 22, 0, 0, 0, 0, 0, 0, 0, 0]);
    const submittedImageSource = draftImage([11, 22, 0, 0, 0, 33, 44, 0, 0, 0]);
    const fingerprintResizes: Array<Parameters<NativeImage['resize']>[0]> = [];
    const submittedImage = new Proxy(submittedImageSource, {
      get(target, property, receiver) {
        if (property !== 'resize') return Reflect.get(target, property, receiver);
        return (options: Parameters<NativeImage['resize']>[0]) => {
          fingerprintResizes.push(options);
          return target.resize(options);
        };
      },
    });
    let captures = 0;
    let requests = 0;
    const api = {
      analyzeDesktop: async (...arguments_: unknown[]) => {
        requests += 1;
        return completedResponse('submitted-frame-analysis', [33, 44], arguments_[4] as number);
      },
    } as unknown as ApiClient;
    const engine = createEngine(api, () => {
      captures += 1;
      return captures === 1 ? watchImage : submittedImage;
    });

    try {
      await engine.setEnabled(true);
      await waitFor(() => engine.getState().latestAnalysisId === 'submitted-frame-analysis');
      assert.equal(requests, 1);
      assert.deepEqual(fingerprintResizes, [{ width: 320, height: 180, quality: 'good' }]);
      assert.deepEqual(
        engine.getState().recognition?.recognized.map((pick) => pick.heroId),
        [11, 22, 33, 44],
      );
    } finally {
      await engine.dispose();
    }
  });

  it('retries one stable recognition failure with the same request and then succeeds', async () => {
    const image = draftImage([11, 22, 0, 0, 0, 33, 44, 0, 0, 0]);
    const requestKeys: unknown[] = [];
    const diagnostics: DiagnosticEventDraft[] = [];
    const api = {
      analyzeDesktop: async (...arguments_: unknown[]) => {
        requestKeys.push(arguments_[5]);
        if (requestKeys.length === 1) {
          throw new DesktopError(
            'IMAGE_RECOGNITION_FAILED',
            'The recognition response was invalid',
            422,
          );
        }
        return completedResponse('retried-analysis', [33, 44], arguments_[4] as number);
      },
    } as unknown as ApiClient;
    const engine = createEngine(api, () => image, [], diagnostics);

    try {
      await engine.setEnabled(true);
      await waitFor(() => engine.getState().latestAnalysisId === 'retried-analysis');
      assert.equal(requestKeys.length, 2);
      assert.equal(requestKeys[1], requestKeys[0]);
      assert.deepEqual(
        diagnostics
          .filter((event) => event.type === 'request_started')
          .map((event) => event.type === 'request_started' ? event.details.attempt : null),
        [1, 2],
      );
    } finally {
      await engine.dispose();
    }
  });

  it('bounds repeated recognition failures and keeps GSI from masking the error', async () => {
    const image = draftImage([11, 22, 0, 0, 0, 33, 44, 0, 0, 0]);
    const gsiListeners: Array<(payload: GsiPayload) => void> = [];
    let requests = 0;
    const api = {
      analyzeDesktop: async () => {
        requests += 1;
        throw new DesktopError(
          'IMAGE_RECOGNITION_FAILED',
          'The recognition response was invalid',
          422,
        );
      },
    } as unknown as ApiClient;
    const engine = createEngine(api, () => image, [], [], gsiListeners);

    try {
      await engine.setEnabled(true);
      await waitFor(() => requests === 2 && engine.getState().phase === 'error');
      gsiListeners[0]?.({ map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' } });
      assert.equal(engine.getState().phase, 'error');
      assert.equal(engine.getState().refreshPending, false);
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(requests, 2);
      assert.equal(engine.getState().phase, 'error');
    } finally {
      await engine.dispose();
    }
  });

  it('discards a stale 2/0 response and publishes the next fresh 2/2 frame', async () => {
    let currentImage = draftImage([11, 22, 0, 0, 0, 0, 0, 0, 0, 0]);
    let releaseFirst: () => void = () => undefined;
    const firstRequest = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const revisions: number[] = [];
    const emissions: EngineState[] = [];
    const api = {
      analyzeDesktop: async (...arguments_: unknown[]) => {
        const revision = arguments_[4] as number;
        revisions.push(revision);
        if (revisions.length === 1) {
          await firstRequest;
          return waitingResponse(revision);
        }
        return completedResponse('fresh-analysis', [33, 44], revision);
      },
    } as unknown as ApiClient;
    const engine = createEngine(api, () => currentImage, emissions);

    try {
      await engine.setEnabled(true);
      await waitFor(() => revisions.length === 1);
      currentImage = draftImage([11, 22, 0, 0, 0, 33, 44, 0, 0, 0]);
      releaseFirst();

      await waitFor(() => engine.getState().latestAnalysisId === 'fresh-analysis');
      assert.deepEqual(revisions, [1, 2]);
      assert.deepEqual(
        engine.getState().recognition?.recognized.map((pick) => pick.heroId),
        [11, 22, 33, 44],
      );
      assert.equal(
        emissions.some((state) => (
          state.recognition?.recognized.length === 2
          && state.recognition.recognized.every((pick) => pick.side === 'ally')
        )),
        false,
      );

      await new Promise((resolve) => setTimeout(resolve, 90));
      assert.equal(revisions.length, 2);
    } finally {
      await engine.dispose();
    }
  });

  it('retains a completed live capability when its frame becomes stale', async () => {
    let currentImage = draftImage([11, 22, 0, 0, 0, 33, 44, 0, 0, 0]);
    let releaseFirst: () => void = () => undefined;
    const firstRequest = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let analyzeCalls = 0;
    const revisions: number[] = [];
    const tokens: unknown[] = [];
    const api = {
      analyzeDesktop: async (...arguments_: unknown[]) => {
        analyzeCalls += 1;
        await firstRequest;
        return completedResponse('live-analysis', [33, 44], arguments_[4] as number);
      },
      reviseDesktop: async (...arguments_: unknown[]) => {
        revisions.push(arguments_[5] as number);
        tokens.push(arguments_[10]);
        return completedResponse('live-analysis', [33, 44, 55], arguments_[5] as number, 1);
      },
    } as unknown as ApiClient;
    const engine = createEngine(api, () => currentImage);

    try {
      await engine.setEnabled(true);
      await waitFor(() => analyzeCalls === 1);
      currentImage = draftImage([11, 22, 0, 0, 0, 33, 44, 55, 0, 0]);
      releaseFirst();

      await waitFor(() => engine.getState().latestAnalysis?.input.enemyHeroIds.length === 3);
      assert.equal(analyzeCalls, 1);
      assert.deepEqual(revisions, [2]);
      assert.deepEqual(tokens, [`freshness-0-${'t'.repeat(40)}`]);
    } finally {
      await engine.dispose();
    }
  });

  it('keeps an incomplete fresh response pending without publishing one visible side', async () => {
    const currentImage = draftImage([11, 22, 0, 0, 0, 0, 0, 0, 0, 0]);
    let calls = 0;
    const api = {
      analyzeDesktop: async (...arguments_: unknown[]) => {
        calls += 1;
        return waitingResponse(arguments_[4] as number);
      },
    } as unknown as ApiClient;
    const engine = createEngine(api, () => currentImage);

    try {
      await engine.setEnabled(true);
      await waitFor(() => engine.getState().recognition !== null);
      assert.equal(engine.getState().latestAnalysis, null);
      assert.equal(
        engine.getState().recognition?.recognized.every((pick) => (
          pick.side === 'unknown' && pick.needsReview
        )),
        true,
      );
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(calls, 1);
    } finally {
      await engine.dispose();
    }
  });
});
