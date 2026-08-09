import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  EngineState,
  OverlayShortcutStatus,
  Position,
  Preferences,
} from '../shared/contracts.ts';
import { createOverlayState } from './overlay-state.ts';

const preferences: Preferences = {
  theme: 'system',
  language: 'en',
  position: 3,
  rank: null,
  startWithWindows: false,
  minimizeToTray: true,
  overlayShortcut: 'PageUp',
  wishlist: [],
  assistantEnabled: true,
  assistantMode: 'vision',
  captureConsent: {
    accepted: true,
    acceptedAt: '2026-08-02T00:00:00.000Z',
  },
  overwolfConsent: {
    accepted: false,
    acceptedAt: null,
  },
  diagnosticsConsent: {
    accepted: false,
    acceptedAt: null,
    version: null,
  },
};

const shortcut: OverlayShortcutStatus = {
  shortcut: 'PageUp',
  available: true,
};

function engineState(
  detectedPosition: Position | null,
  analysisPosition: Position,
): EngineState {
  return {
    enabled: true,
    phase: 'ready',
    message: 'Counterpicks are ready',
    latestAnalysisId: '00000000-0000-4000-8000-000000000001',
    latestAnalysis: {
      id: '00000000-0000-4000-8000-000000000001',
      source: 'desktop',
      input: {
        source: 'desktop',
        position: analysisPosition,
        allyHeroIds: [],
        enemyHeroIds: [1, 2],
      },
      result: {
        patch: '7.41',
        metaFetchedAt: '2026-08-02T00:00:00.000Z',
        recommendations: [{
          hero: {
            id: 3,
            name: 'npc_dota_hero_bane',
            localizedName: 'Bane',
          },
          score: 0.91,
          confidence: 'high',
          reasons: [],
        }],
      },
      createdAt: '2026-08-02T00:00:00.000Z',
    },
    lastSeenAt: '2026-08-02T00:00:00.000Z',
    dotaDetected: true,
    draftActive: true,
    refreshPending: false,
    recognition: {
      quality: 'clear',
      detectedPosition,
      recognized: [],
    },
  };
}

describe('createOverlayState position resolution', () => {
  it('uses a confidently detected position for the current draft', () => {
    const state = createOverlayState(
      engineState(2, 2),
      preferences,
      shortcut,
      new Map(),
      true,
    );

    assert.equal(state.position, 2);
    assert.equal(state.positionSource, 'detected');
    assert.equal(state.analysisPosition, 2);
    assert.equal(state.recommendations.length, 1);
  });

  it('falls back to the manually selected position when detection is unavailable', () => {
    const state = createOverlayState(
      engineState(null, 3),
      preferences,
      shortcut,
      new Map(),
      true,
    );

    assert.equal(state.position, 3);
    assert.equal(state.positionSource, 'manual');
    assert.equal(state.recommendations.length, 1);
  });

  it('does not show recommendations calculated for a stale position', () => {
    const state = createOverlayState(
      engineState(2, 3),
      preferences,
      shortcut,
      new Map(),
      true,
    );

    assert.equal(state.position, 2);
    assert.equal(state.recommendations.length, 0);
  });

  it('keeps unknown visual groups hidden and requests one overlay confirmation', () => {
    const unresolved = engineState(null, 3);
    unresolved.latestAnalysis = null;
    unresolved.latestAnalysisId = null;
    unresolved.phase = 'watching_draft';
    unresolved.recognition = {
      quality: 'partial',
      detectedPosition: null,
      recognized: [
        {
          side: 'unknown',
          visualGroup: 'left',
          slot: 0,
          heroId: 27,
          heroName: 'npc_dota_hero_shadow_shaman',
          localizedName: 'Shadow Shaman',
          confidence: 0.93,
          needsReview: true,
        },
        {
          side: 'unknown',
          visualGroup: 'right',
          slot: 0,
          heroId: 74,
          heroName: 'npc_dota_hero_invoker',
          localizedName: 'Invoker',
          confidence: 0.92,
          needsReview: true,
        },
      ],
    };

    const state = createOverlayState(unresolved, preferences, shortcut, new Map(), true);

    assert.equal(state.picks.length, 0);
    assert.deepEqual(state.draftOrientation, {
      required: true,
      allyGroup: null,
      source: null,
    });
  });

  it('publishes complete visual groups after the confirmed server response', () => {
    const resolved = engineState(null, 3);
    resolved.latestAnalysis = null;
    resolved.latestAnalysisId = null;
    resolved.phase = 'watching_draft';
    resolved.draftOrientation = {
      allyGroup: 'right',
      source: 'manual_confirmation',
    };
    resolved.recognition = {
      quality: 'partial',
      detectedPosition: null,
      recognized: [
        {
          side: 'enemy',
          visualGroup: 'left',
          slot: 1,
          heroId: 27,
          heroName: 'npc_dota_hero_shadow_shaman',
          localizedName: 'Shadow Shaman',
          confidence: 0.93,
          needsReview: false,
        },
        {
          side: 'ally',
          visualGroup: 'right',
          slot: 2,
          heroId: 74,
          heroName: 'npc_dota_hero_invoker',
          localizedName: 'Invoker',
          confidence: 0.92,
          needsReview: false,
        },
      ],
    };

    const state = createOverlayState(resolved, preferences, shortcut, new Map(), true);

    assert.deepEqual(
      state.picks.map(({ side, slot, heroId }) => ({ side, slot, heroId })),
      [
        { side: 'ally', slot: 2, heroId: 74 },
        { side: 'enemy', slot: 1, heroId: 27 },
      ],
    );
    assert.deepEqual(state.draftOrientation, {
      required: false,
      allyGroup: 'right',
      source: 'manual_confirmation',
    });
  });

  it('does not publish unresolved picks even after an orientation selection', () => {
    const unresolved = engineState(null, 3);
    unresolved.latestAnalysis = null;
    unresolved.latestAnalysisId = null;
    unresolved.draftOrientation = {
      allyGroup: 'left',
      source: 'manual_confirmation',
    };
    unresolved.recognition = {
      quality: 'partial',
      detectedPosition: null,
      recognized: [{
        side: 'unknown',
        visualGroup: 'left',
        slot: 0,
        heroId: 27,
        heroName: 'npc_dota_hero_shadow_shaman',
        localizedName: 'Shadow Shaman',
        confidence: 0.84,
        needsReview: true,
      }],
    };

    const state = createOverlayState(unresolved, preferences, shortcut, new Map(), true);

    assert.equal(state.picks.length, 0);
    assert.equal(state.draftOrientation.required, false);
  });
});
