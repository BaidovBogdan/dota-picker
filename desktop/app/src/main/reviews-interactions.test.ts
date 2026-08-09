import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

describe('review interactions', () => {
  it('keeps the saved result and editable form state after create or update', async () => {
    const reviews = await source('../renderer/pages/reviews.tsx');

    assert.match(reviews, /onSuccess: \(_review, input\) => \{\s*form\.reset\(input\);/);
    assert.match(reviews, /saveMutation\.isSuccess && !form\.formState\.isDirty/);
    assert.doesNotMatch(reviews, /form\.reset\(\{\s*analysisId: ''/);
    assert.match(reviews, /<textarea[\s\S]*?\.\.\.form\.register\('comment'\)/);
  });

  it('requires the app dialog before deleting and keeps cancel non-destructive', async () => {
    const reviews = await source('../renderer/pages/reviews.tsx');

    assert.doesNotMatch(reviews, /(?:globalThis|window)\.confirm/);
    assert.match(reviews, /setReviewToDelete\(review\.id\)/);
    assert.match(reviews, /<ConfirmDialog[\s\S]*?onCancel=\{\(\) => \{[\s\S]*?setReviewToDelete\(null\)/);
    assert.match(reviews, /onConfirm=\{\(\) => \{\s*if \(reviewToDelete && !deleteMutation\.isPending\) deleteMutation\.mutate\(reviewToDelete\);/);
  });

  it('starts on Cancel, traps Tab, handles Escape, pending, and focus restoration', async () => {
    const [dialog, accessibility] = await Promise.all([
      source('../renderer/components/confirm-dialog.tsx'),
      source('../renderer/components/dialog-accessibility.ts'),
    ]);

    assert.match(dialog, /data-dialog-initial-focus/);
    assert.match(dialog, /if \(!pending\) onCancel\(\)/);
    assert.match(dialog, /if \(!pending\) onConfirm\(\)/);
    assert.match(accessibility, /event\.key === 'Escape' && !pending/);
    assert.match(accessibility, /event\.key !== 'Tab'/);
    assert.match(accessibility, /restoreFocus\?\.isConnected/);
    assert.match(accessibility, /sibling\.setAttribute\('inert', ''\)/);
  });
});
