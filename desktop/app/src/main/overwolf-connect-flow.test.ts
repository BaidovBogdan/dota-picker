import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Preferences } from '../shared/contracts.js';
import {
  activateOverwolfLive,
  type OverwolfConnectPreferencesPatch,
} from '../shared/overwolf-connect-flow.js';

const basePreferences: Preferences = {
  theme: 'system',
  language: 'ru',
  position: 1,
  rank: null,
  startWithWindows: false,
  minimizeToTray: true,
  overlayShortcut: 'PageUp',
  wishlist: [],
  assistantEnabled: false,
  assistantMode: 'vision',
  captureConsent: { accepted: false, acceptedAt: null },
  overwolfConsent: { accepted: false, acceptedAt: null },
};

describe('activateOverwolfLive', () => {
  it('switches a disabled Vision assistant before enabling and connecting after consent', async () => {
    const calls: string[] = [];
    let appliedPatch: OverwolfConnectPreferencesPatch | null = null;
    const acceptedAt = '2026-08-08T10:00:00.000Z';

    const result = await activateOverwolfLive({
      consentAcceptedAt: acceptedAt,
      updatePreferences: async (patch) => {
        calls.push('preferences');
        appliedPatch = patch;
        return {
          ...basePreferences,
          ...patch,
          overwolfConsent: patch.overwolfConsent ?? basePreferences.overwolfConsent,
        };
      },
      setEnabled: async (enabled) => {
        calls.push(`enabled:${enabled}`);
      },
      connect: async () => {
        calls.push('connect');
        return { phase: 'pairing' as const };
      },
    });

    assert.deepEqual(calls, ['preferences', 'enabled:true', 'connect']);
    assert.deepEqual(appliedPatch, {
      assistantMode: 'overwolf',
      overwolfConsent: { accepted: true, acceptedAt },
    });
    assert.equal(result.preferences.assistantMode, 'overwolf');
    assert.equal(result.preferences.overwolfConsent.accepted, true);
    assert.equal(result.bridge.phase, 'pairing');
  });

  it('preserves existing consent while still switching mode before connection', async () => {
    const calls: string[] = [];
    let appliedPatch: OverwolfConnectPreferencesPatch | null = null;

    await activateOverwolfLive({
      updatePreferences: async (patch) => {
        calls.push('preferences');
        appliedPatch = patch;
        return { ...basePreferences, ...patch };
      },
      setEnabled: async () => {
        calls.push('enabled');
      },
      connect: async () => {
        calls.push('connect');
        return null;
      },
    });

    assert.deepEqual(calls, ['preferences', 'enabled', 'connect']);
    assert.deepEqual(appliedPatch, { assistantMode: 'overwolf' });
  });
});
