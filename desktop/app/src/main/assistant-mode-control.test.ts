import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  assistantModeOptionA11y,
  focusAssistantModeOption,
  resolveAssistantModeNavigation,
} from '../shared/assistant-mode-control.js';

describe('assistant mode segmented control accessibility', () => {
  it('keeps roving radio semantics while a mutation blocks activation', () => {
    assert.deepEqual(
      assistantModeOptionA11y('vision', 'overwolf', true),
      {
        'aria-checked': false,
        'aria-disabled': true,
        tabIndex: -1,
      },
    );
    assert.deepEqual(
      assistantModeOptionA11y('overwolf', 'overwolf', true),
      {
        'aria-checked': true,
        'aria-disabled': true,
        tabIndex: 0,
      },
    );
  });

  it('maps radio navigation keys and focuses the requested option', () => {
    assert.equal(resolveAssistantModeNavigation('ArrowLeft'), 'vision');
    assert.equal(resolveAssistantModeNavigation('ArrowRight'), 'overwolf');
    assert.equal(resolveAssistantModeNavigation('Home'), 'vision');
    assert.equal(resolveAssistantModeNavigation('End'), 'overwolf');
    assert.equal(resolveAssistantModeNavigation('Enter'), null);

    let selector = '';
    let focused = false;
    const root = {
      querySelector: (nextSelector: string) => {
        selector = nextSelector;
        return { focus: () => { focused = true; } };
      },
    } as unknown as ParentNode;
    focusAssistantModeOption(root, 'overwolf');

    assert.equal(selector, '[data-assistant-mode="overwolf"]');
    assert.equal(focused, true);
  });

  it('uses aria-disabled instead of native disabled so focused radios stay focusable', async () => {
    const dashboard = await readFile(
      new URL('../renderer/pages/dashboard.tsx', import.meta.url),
      'utf8',
    );

    assert.equal(dashboard.includes('aria-busy={modeMutation.isPending}'), true);
    assert.equal(dashboard.includes('assistantModeOptionA11y('), true);
    const radioOpeningTags = dashboard.match(
      /<button\b[^>]*data-assistant-mode="(?:vision|overwolf)"[^>]*>/g,
    ) ?? [];
    assert.equal(radioOpeningTags.length, 2);
    for (const openingTag of radioOpeningTags) {
      assert.equal(/\bdisabled\s*=/.test(openingTag), false);
    }
  });
});
