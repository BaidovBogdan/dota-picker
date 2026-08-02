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
  captureConsent: {
    accepted: true,
    acceptedAt: '2026-08-02T00:00:00.000Z',
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
});
