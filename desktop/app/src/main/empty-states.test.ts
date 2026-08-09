import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

describe('new-account empty states', () => {
  it('does not render an actionable review form without loaded analyses', async () => {
    const reviews = await source('../renderer/pages/reviews.tsx');
    const pendingBranch = reviews.indexOf('historyQuery.isPending ?');
    const errorBranch = reviews.indexOf('historyQuery.isError ?');
    const readyBranch = reviews.indexOf('analysisOptions.length ?');
    const form = reviews.indexOf('<form onSubmit=');

    assert.ok(pendingBranch >= 0);
    assert.ok(errorBranch > pendingBranch);
    assert.ok(readyBranch > errorBranch);
    assert.ok(form > readyBranch);
    assert.match(reviews, /title=\{text\('Пока нечего оценивать', 'Nothing to rate yet'\)\}/);
    assert.match(reviews, /Your reviews will appear here after you submit your first rating\./);
  });

  it('shows history filters only when at least one result exists', async () => {
    const history = await source('../renderer/pages/history.tsx');
    const historyGuard = history.indexOf('{hasHistory ? (');
    const toolbar = history.indexOf('<StickyFilterBar', historyGuard);

    assert.match(history, /const hasHistory = allItems\.length > 0;/);
    assert.ok(historyGuard >= 0);
    assert.ok(toolbar > historyGuard);
    assert.match(history, /icon=\{<ClockCounterClockwiseIcon/);
  });
});
