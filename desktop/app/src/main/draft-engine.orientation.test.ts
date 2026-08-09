import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NativeImage } from 'electron';

import type { DraftAllyGroup, Preferences } from '../shared/contracts.js';
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

function recognition(allyGroup: DraftAllyGroup | null) {
  const entries = [
    {
      visualGroup: 'left' as const,
      slot: 0,
      heroId: 27,
      heroName: 'npc_dota_hero_shadow_shaman',
      localizedName: 'Shadow Shaman',
      confidence: 0.93,
    },
    {
      visualGroup: 'right' as const,
      slot: 0,
      heroId: 74,
      heroName: 'npc_dota_hero_invoker',
      localizedName: 'Invoker',
      confidence: 0.92,
    },
  ];
  return {
    quality: allyGroup ? 'clear' as const : 'partial' as const,
    detectedPosition: null,
    recognized: entries.map((entry) => ({
      ...entry,
      side: allyGroup
        ? entry.visualGroup === allyGroup ? 'ally' as const : 'enemy' as const
        : 'unknown' as const,
      needsReview: allyGroup === null,
    })),
    model: 'local-portrait-index-v2-match-score',
  };
}

function harness(initialPayload: GsiPayload) {
  const calls: Array<{
    allyGroup: DraftAllyGroup | null;
    orientationSource: string | null;
  }> = [];
  const api = {
    analyzeDesktop: async (...arguments_: unknown[]) => {
      const allyGroup = arguments_[7] as DraftAllyGroup | null;
      calls.push({
        allyGroup,
        orientationSource: arguments_[8] as string | null,
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
        recognition: recognition(allyGroup),
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
      nextListener(initialPayload);
      return { installed: true, configPath: null };
    },
    stop: async () => undefined,
  } as unknown as GsiReceiver;
  const engine = new DraftEngine(api, preferences, gsi, () => undefined, {
    captureDotaWindow: async () => stableImage(),
    captureIntervalMs: 50,
    captureDebounceMs: 1,
  });
  return {
    calls,
    engine,
    emitGsi: (payload: GsiPayload) => {
      const activeListener = listener;
      if (!activeListener) throw new Error('GSI listener is unavailable');
      activeListener(payload);
    },
  };
}

describe('DraftEngine GSI orientation', () => {
  for (const allyGroup of ['left', 'right'] as const) {
    it(`maps the whole ${allyGroup} group after an exact local hero match`, async () => {
      const localHero = allyGroup === 'left'
        ? { id: 27, name: 'npc_dota_hero_shadow_shaman' }
        : { id: 74, name: 'npc_dota_hero_invoker' };
      const { calls, engine } = harness({
        map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
        player: { team_name: 'radiant' },
        hero: localHero,
      });

      try {
        await engine.setEnabled(true);
        await waitFor(() => calls.length === 2);

        assert.deepEqual(calls[0], { allyGroup: null, orientationSource: null });
        assert.deepEqual(calls[1], { allyGroup, orientationSource: 'gsi_player_hero' });
        assert.deepEqual(engine.getState().draftOrientation, {
          allyGroup,
          source: 'gsi_player_hero',
        });
      } finally {
        await engine.dispose();
      }
    });
  }

  it('keeps a manual override session-only and clears it at the draft boundary', async () => {
    const { calls, engine, emitGsi } = harness({
      map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
      player: { team_name: 'dire' },
      hero: { id: 0, name: '' },
    });

    try {
      await engine.setEnabled(true);
      await waitFor(() => calls.length === 1);
      await engine.setManualAllyGroupForCurrentDraft('right');
      await waitFor(() => calls.length === 2);

      assert.deepEqual(calls[1], {
        allyGroup: 'right',
        orientationSource: 'manual_confirmation',
      });
      assert.deepEqual(engine.getState().draftOrientation, {
        allyGroup: 'right',
        source: 'manual_confirmation',
      });

      emitGsi({ map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' } });
      assert.equal(engine.getState().draftOrientation, null);
      emitGsi({
        map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
        player: { team_name: 'radiant' },
        hero: { id: 0, name: '' },
      });
      await waitFor(() => calls.length === 3);
      assert.deepEqual(calls[2], { allyGroup: null, orientationSource: null });

      await engine.setEnabled(false);
      assert.equal(engine.getState().draftOrientation, null);
    } finally {
      await engine.dispose();
    }
  });
});
