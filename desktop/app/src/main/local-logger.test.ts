import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  desktopLogFileName,
  desktopLogMaxSizeBytes,
  isAutomatedTestRuntime,
} from './local-logger.js';

describe('desktop local logging isolation', () => {
  it('keeps production, development, and automated logs separate', () => {
    assert.equal(desktopLogMaxSizeBytes, 5 * 1024 * 1024);
    assert.equal(desktopLogFileName(true, false), 'main.log');
    assert.equal(desktopLogFileName(false, false), 'development.log');
    assert.equal(desktopLogFileName(true, true), 'test.log');
    assert.equal(desktopLogFileName(false, true), 'test.log');
  });

  it('detects unit and visual test environments', () => {
    assert.equal(isAutomatedTestRuntime({ NODE_TEST_CONTEXT: 'child-v8' }), true);
    assert.equal(isAutomatedTestRuntime({ VITEST: 'true' }), true);
    assert.equal(isAutomatedTestRuntime({ COUNTERPICK_E2E: '1' }), true);
    assert.equal(isAutomatedTestRuntime({ COUNTERPICK_OVERLAY_PREVIEW: '1' }), true);
    assert.equal(isAutomatedTestRuntime({}), false);
  });

  it('keeps updater logging under the shared desktop configuration', async () => {
    const source = await readFile(new URL('./update-manager.ts', import.meta.url), 'utf8');
    assert.equal(source.includes('log.initialize('), false);
    assert.equal(source.includes('transports.file.maxSize'), false);
  });
});
