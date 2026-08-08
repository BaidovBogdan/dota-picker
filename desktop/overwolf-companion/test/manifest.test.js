import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

describe('Overwolf manifest architecture', () => {
  it('uses a hidden controller for auto-launch and keeps status UI separate', async () => {
    const manifest = JSON.parse(await readFile(
      new URL('../dist/manifest.json', import.meta.url),
      'utf8',
    ));

    assert.equal(manifest.data.start_window, 'background');
    assert.deepEqual(manifest.data.game_events, [7314]);
    assert.equal(manifest.data.windows.background.is_background_page, true);
    assert.equal(manifest.data.windows.background.background_optimization, false);
    assert.equal(manifest.data.windows.background.show_in_taskbar, undefined);
    assert.equal(manifest.data.windows.status.desktop_only, true);
    assert.equal(manifest.data.windows.status.show_in_taskbar, true);
    assert.equal(manifest.data.launch_events[0].start_minimized, true);
  });
});
