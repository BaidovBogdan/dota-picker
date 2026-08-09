import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isOverlayRefreshVisible } from '../renderer/pages/overlay.tsx';

describe('overlay position presentation', () => {
  it('does not replace the waiting status while a position action is pending', () => {
    assert.equal(isOverlayRefreshVisible(false, 2), false);
  });

  it('shows refresh status for explicit refresh and engine revalidation', () => {
    assert.equal(isOverlayRefreshVisible(false, 'refresh'), true);
    assert.equal(isOverlayRefreshVisible(true, 2), true);
  });
});
