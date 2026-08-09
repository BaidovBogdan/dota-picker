import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('keeps the overlay interactive while presenting it without initial activation', async () => {
  const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
  const nativeSource = await readFile(new URL('./win32-no-activate.ts', import.meta.url), 'utf8');
  const start = source.indexOf('function createOverlayWindow()');
  const end = source.indexOf('\nfunction toggleOverlay()', start);
  const createOverlayWindow = source.slice(start, end);

  assert.equal(createOverlayWindow.includes('focusable: true'), true);
  assert.equal(
    createOverlayWindow.includes('if (!applyWindowsNoActivateStyle(window)) window.setFocusable(false)'),
    true,
  );
  assert.equal(createOverlayWindow.includes('Win32NoActivateOverlay'), false);
  assert.equal(createOverlayWindow.includes('focusOnNavigation: false'), true);
  assert.equal(createOverlayWindow.includes('window.showInactive();'), false);
  assert.equal(source.includes('window.showInactive();'), true);
  assert.equal(createOverlayWindow.includes('setIgnoreMouseEvents(true'), false);
  assert.match(nativeSource, /WS_EX_NOACTIVATE\s*=\s*0x08000000n/);
  assert.match(nativeSource, /SetWindowLongPtrW/);
  assert.equal(nativeSource.includes('koffi.register'), false);
  assert.equal(nativeSource.includes('SetWindowSubclass'), false);
});
