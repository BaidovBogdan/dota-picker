import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDraftFrameFingerprint,
  draftFrameDistance,
  draftFramesMatch,
} from './draft-frame-fingerprint.js';
import { draftImage } from './draft-frame-fingerprint.fixture.js';

describe('Draft frame fingerprint', () => {
  it('keeps an unchanged draft stable without an upload-triggering change', () => {
    const slots = [11, 22, 0, 0, 0, 0, 0, 0, 0, 0];
    assert.equal(
      draftFramesMatch(
        createDraftFrameFingerprint(draftImage(slots)),
        createDraftFrameFingerprint(draftImage([...slots])),
      ),
      true,
    );
  });

  it('detects a pick appearing only in a right-side hero slot', () => {
    const before = createDraftFrameFingerprint(draftImage([
      11, 22, 0, 0, 0,
      0, 0, 0, 0, 0,
    ]));
    const after = createDraftFrameFingerprint(draftImage([
      11, 22, 0, 0, 0,
      33, 0, 0, 0, 0,
    ]));
    assert.equal(draftFramesMatch(before, after), false);
    assert.equal(draftFrameDistance(before, after), 1);
  });
});
