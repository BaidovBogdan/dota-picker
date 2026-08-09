import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  preferencesSchema,
  type Preferences,
  type PreferencesPatch,
} from '../shared/contracts.ts';
import { applyPreferenceEngineChanges, updatePreferences } from './preferences-update.ts';

it('returns preferences after post-update engine side effects', async () => {
  let value: Preferences = {
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
    captureConsent: { accepted: true, acceptedAt: '2026-08-08T00:00:00.000Z' },
    overwolfConsent: { accepted: false, acceptedAt: null },
  };
  const store = {
    get: async () => structuredClone(value),
    update: async (patch: PreferencesPatch) => {
      value = { ...value, ...patch } as Preferences;
      return structuredClone(value);
    },
  };
  const result = await updatePreferences(store, { assistantMode: 'overwolf' }, async () => {
    value = { ...value, assistantEnabled: false };
  });
  assert.equal(result.assistantMode, 'overwolf');
  assert.equal(result.assistantEnabled, false);
});

it('forces an unchanged-frame refresh when the selected rank changes', async () => {
  const previous: Preferences = {
    theme: 'system',
    language: 'en',
    position: 3,
    rank: 4,
    startWithWindows: false,
    minimizeToTray: true,
    overlayShortcut: 'PageUp',
    wishlist: [],
    assistantEnabled: true,
    assistantMode: 'vision',
    captureConsent: { accepted: true, acceptedAt: '2026-08-08T00:00:00.000Z' },
    overwolfConsent: { accepted: false, acceptedAt: null },
  };
  const current: Preferences = { ...previous, rank: 5 };
  const calls: string[] = [];

  await applyPreferenceEngineChanges(previous, current, {
    switchMode: async (mode) => {
      calls.push(`mode:${mode}`);
    },
    useManualPositionForCurrentDraft: () => {
      calls.push('manual-position');
    },
    refresh: async (force) => {
      calls.push(`refresh:${force}`);
    },
  });

  assert.deepEqual(calls, ['refresh:true']);
});

it('drops the legacy persistent Radiant placement during preference migration', () => {
  const parsed = preferencesSchema.parse({
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
    radiantDraftSide: 'left',
    captureConsent: { accepted: true, acceptedAt: '2026-08-08T00:00:00.000Z' },
    overwolfConsent: { accepted: false, acceptedAt: null },
  });

  assert.equal('radiantDraftSide' in parsed, false);
});
