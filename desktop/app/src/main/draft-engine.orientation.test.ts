import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NativeImage } from 'electron';

import type { Preferences } from '../shared/contracts.js';
import type { ApiClient } from './api-client.js';
import { DraftEngine } from './draft-engine.js';
import type { GsiPayload, GsiReceiver } from './gsi.js';
import type { PreferencesStore } from './preferences-store.js';

function stableImage(): NativeImage {
  const image = {
    getSize: () => ({ width: 1600, height: 900 }),
    crop: () => image,
    resize: () => image,
    toBitmap: () => Buffer.alloc(24 * 6 * 4, 128),
    toPNG: () => Buffer.from('stable-draft-frame'),
    isEmpty: () => false,
  };
  return image as unknown as NativeImage;
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for draft engine call');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('DraftEngine GSI orientation', () => {
  it('reanalyzes an unchanged frame when the local team becomes available', async () => {
    const calls: Array<{
      allyGroup: unknown;
      orientationSource: unknown;
    }> = [];
    const api = {
      analyzeDesktop: async (...arguments_: unknown[]) => {
        calls.push({
          allyGroup: arguments_[7],
          orientationSource: arguments_[8],
        });
        return {
          status: 'waiting' as const,
          reason: 'insufficient_enemy_picks' as const,
          revision: arguments_[4] as number,
          frameHash: 'a'.repeat(64),
          quota: {
            plan: 'free' as const,
            remaining: 3,
            limit: 3,
            nextRefillAt: null,
            planExpiresAt: null,
          },
          recognition: {
            quality: 'partial' as const,
            detectedPosition: null,
            recognized: [],
            model: 'test',
          },
        };
      },
    } as unknown as ApiClient;
    let preferencesValue: Preferences = {
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
      radiantDraftSide: 'left',
      captureConsent: { accepted: true, acceptedAt: '2026-08-08T00:00:00.000Z' },
      overwolfConsent: { accepted: false, acceptedAt: null },
    };
    const preferences = {
      get: async () => structuredClone(preferencesValue),
      setAssistantEnabled: async (enabled: boolean) => {
        preferencesValue = { ...preferencesValue, assistantEnabled: enabled };
        return structuredClone(preferencesValue);
      },
    } as unknown as PreferencesStore;
    let listener: ((payload: GsiPayload) => void) | null = null;
    const gsi = {
      start: async (nextListener: (payload: GsiPayload) => void) => {
        listener = nextListener;
        nextListener({ map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' } });
        return { installed: true, configPath: null };
      },
      stop: async () => undefined,
    } as unknown as GsiReceiver;
    const emitGsi = (payload: GsiPayload) => {
      const activeListener = listener;
      if (!activeListener) throw new Error('GSI listener is unavailable');
      activeListener(payload);
    };
    const image = stableImage();
    const engine = new DraftEngine(api, preferences, gsi, () => undefined, {
      captureDotaWindow: async () => image,
      captureIntervalMs: 50,
      captureDebounceMs: 1,
    });

    try {
      await engine.setEnabled(true);
      await waitFor(() => calls.length === 1);
      assert.deepEqual(calls[0], { allyGroup: null, orientationSource: null });

      emitGsi({
        map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
        player: { team_name: 'radiant' },
      });
      await waitFor(() => calls.length === 2);

      assert.deepEqual(calls[1], {
        allyGroup: 'left',
        orientationSource: 'gsi_layout_heuristic',
      });
    } finally {
      await engine.dispose();
    }
  });
});
