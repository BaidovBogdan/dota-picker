import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('keeps the overlay interactive while presenting it without initial activation', async () => {
  const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
  const nativeSource = await readFile(new URL('./win32-no-activate.ts', import.meta.url), 'utf8');
  const nativeImplementation = await readFile(
    new URL('../../native/noactivate/noactivate.cc', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('function createOverlayWindow()');
  const end = source.indexOf('\nfunction toggleOverlay()', start);
  const createOverlayWindow = source.slice(start, end);

  assert.equal(createOverlayWindow.includes('focusable: false'), true);
  assert.equal(createOverlayWindow.includes('installWindowsNoActivate(window);'), true);
  assert.equal(createOverlayWindow.includes('focusOnNavigation: false'), true);
  assert.equal(createOverlayWindow.includes('window.showInactive();'), false);
  assert.equal(source.includes('window.showInactive();'), true);
  assert.equal(createOverlayWindow.includes('setIgnoreMouseEvents(true'), false);
  assert.match(nativeSource, /counterpick_noactivate\.node/);
  assert.equal(nativeSource.includes('koffi.register'), false);
  assert.match(nativeImplementation, /message == WM_MOUSEACTIVATE/);
  assert.match(nativeImplementation, /return MA_NOACTIVATE;/);
  assert.match(nativeImplementation, /DefSubclassProc/);
  assert.match(nativeImplementation, /WM_NCDESTROY/);
  assert.equal(nativeImplementation.includes('napi_call_function'), false);
});
