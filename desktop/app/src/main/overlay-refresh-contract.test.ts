import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

describe('overlay refresh contract', () => {
  it('forces a fresh capture when the user explicitly refreshes the overlay', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
    const registration = source.slice(source.indexOf('registerOverlayIpc({'));
    const refresh = registration.slice(
      registration.indexOf('refresh: async () => {'),
      registration.indexOf('setPosition: async'),
    );

    assert.match(refresh, /else await engine\?\.refresh\(true\);/);
  });
});
