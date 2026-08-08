import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { heroDetailRefreshInterval } from '../shared/hero-detail-refresh.js';

describe('hero detail background refresh', () => {
  it('uses bounded backoff while builds are collecting', () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5].map((count) => heroDetailRefreshInterval('collecting', false, count)),
      [2_000, 4_000, 8_000, 12_000, false],
    );
  });

  it('does not poll terminal build states', () => {
    assert.equal(heroDetailRefreshInterval('ready', false, 1), false);
    assert.equal(heroDetailRefreshInterval('unavailable', false, 1), false);
    assert.equal(heroDetailRefreshInterval(undefined, false, 1), false);
  });

  it('refreshes a stale terminal snapshot with the same bounded schedule', () => {
    assert.equal(heroDetailRefreshInterval('ready', true, 1), 2_000);
    assert.equal(heroDetailRefreshInterval('ready', true, 5), false);
  });

  it('stops after four completed refreshes even when every refresh fails', () => {
    const initialSuccessfulFetches = 1;
    assert.deepEqual(
      [0, 1, 2, 3, 4].map((failedFetches) => heroDetailRefreshInterval(
        'collecting',
        false,
        initialSuccessfulFetches + failedFetches,
      )),
      [2_000, 4_000, 8_000, 12_000, false],
    );
  });
});
