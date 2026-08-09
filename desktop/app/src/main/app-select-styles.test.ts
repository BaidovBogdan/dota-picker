import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const stylesUrl = new URL('../renderer/styles.css', import.meta.url);

test('select popup follows the trigger and grows only for longer content', async () => {
  const styles = await readFile(stylesUrl, 'utf8');

  assert.match(
    styles,
    /\.app-select-content\s*\{[\s\S]*?width:\s*max-content;[\s\S]*?min-width:\s*min\(\s*var\(--radix-select-trigger-width\),\s*var\(--radix-select-content-available-width\)\s*\);[\s\S]*?max-width:\s*var\(--radix-select-content-available-width\);/,
  );
  assert.doesNotMatch(styles, /\.app-select-content\s*\{[\s\S]*?width:\s*max\([^;]*214px\);/);
});

test('titlebar status has no decorative corner', async () => {
  const styles = await readFile(stylesUrl, 'utf8');

  assert.doesNotMatch(styles, /\.titlebar__status::(?:before|after)\s*\{/);
});
