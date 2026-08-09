import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { preferencesSchema } from '../shared/contracts.js';

describe('diagnostics consent', () => {
  it('migrates existing users to remote diagnostics disabled', () => {
    const parsed = preferencesSchema.parse({
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
      captureConsent: { accepted: false, acceptedAt: null },
      overwolfConsent: { accepted: false, acceptedAt: null },
    });
    assert.deepEqual(parsed.diagnosticsConsent, {
      accepted: false,
      acceptedAt: null,
      version: null,
    });
  });

  it('rejects consent without a matching timestamp and policy version', () => {
    const base = preferencesSchema.parse({
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
      captureConsent: { accepted: false, acceptedAt: null },
      overwolfConsent: { accepted: false, acceptedAt: null },
    });
    assert.equal(preferencesSchema.safeParse({
      ...base,
      diagnosticsConsent: { accepted: true, acceptedAt: null, version: null },
    }).success, false);
  });

  it('discloses exact fields, retention, exclusions, and local-log behavior', async () => {
    const source = await readFile(
      new URL('../renderer/pages/settings.tsx', import.meta.url),
      'utf8',
    );
    for (const phrase of [
      'Only with your permission',
      'Counterpick account ID',
      'recognized and recommended hero IDs',
      'hero IDs and slots actually visible in the overlay',
      'Screenshots, player names, Steam IDs, tokens, raw GSI',
      'no more than 30 days',
      'deletes the unsent queue',
      'the local log remains on this device',
      'Open local log folder',
    ]) {
      assert.equal(source.includes(phrase), true, phrase);
    }
  });
});
