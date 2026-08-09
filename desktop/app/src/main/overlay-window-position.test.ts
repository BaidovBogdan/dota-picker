import assert from 'node:assert/strict';
import test from 'node:test';

import { overlayWindowPosition } from './overlay-window-position.js';

test('opens the overlay below the top draft portraits while keeping right alignment', () => {
  assert.deepEqual(
    overlayWindowPosition(
      { x: 0, y: 0, width: 1920, height: 1040 },
      { width: 452, height: 278 },
    ),
    { x: 1446, y: 142 },
  );
});

test('respects an offset work area and clamps the overlay on a small display', () => {
  assert.deepEqual(
    overlayWindowPosition(
      { x: -1280, y: 36, width: 1280, height: 720 },
      { width: 452, height: 278 },
    ),
    { x: -474, y: 178 },
  );
  assert.deepEqual(
    overlayWindowPosition(
      { x: 0, y: 0, width: 480, height: 320 },
      { width: 452, height: 278 },
    ),
    { x: 6, y: 42 },
  );
});
