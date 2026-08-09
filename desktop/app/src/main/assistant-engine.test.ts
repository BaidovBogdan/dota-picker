import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EngineState } from '../shared/contracts.js';
import { AssistantEngine } from './assistant-engine.js';
import type { DraftEngine } from './draft-engine.js';
import type { OverwolfDraftEngine } from './overwolf-draft-engine.js';
import type { PreferencesStore } from './preferences-store.js';

const state: EngineState = {
  enabled: true,
  phase: 'off',
  message: null,
  latestAnalysisId: null,
  latestAnalysis: null,
  lastSeenAt: null,
  dotaDetected: false,
  draftActive: false,
  refreshPending: false,
};

function implementation(
  name: string,
  events: string[],
  restoreGate: Promise<void> = Promise.resolve(),
) {
  return {
    getState: () => state,
    restore: async () => {
      events.push(`${name}:restore:start`);
      await restoreGate;
      events.push(`${name}:restore:end`);
    },
    setEnabled: async () => state,
    suspend: async () => {
      events.push(`${name}:suspend`);
      return state;
    },
    retry: async () => state,
    refresh: async () => state,
    useManualPositionForCurrentDraft: () => undefined,
    setManualAllyGroupForCurrentDraft: async () => state,
    dispose: async () => {
      events.push(`${name}:dispose`);
    },
  };
}

describe('AssistantEngine shutdown serialization', () => {
  it('waits for an active transition and blocks later mode transitions before disposal', async () => {
    const events: string[] = [];
    let releaseRestore: () => void = () => undefined;
    const restoreGate = new Promise<void>((resolve) => {
      releaseRestore = resolve;
    });
    const vision = implementation('vision', events, restoreGate);
    const overwolf = implementation('overwolf', events);
    const preferences = {
      get: async () => ({
        assistantMode: 'vision' as const,
        captureConsent: { accepted: true },
        overwolfConsent: { accepted: true },
      }),
      setAssistantEnabled: async () => undefined,
    };
    const engine = new AssistantEngine(
      preferences as unknown as PreferencesStore,
      vision as unknown as DraftEngine,
      overwolf as unknown as OverwolfDraftEngine,
      () => undefined,
    );

    const restore = engine.restore();
    await Promise.resolve();
    const dispose = engine.dispose();
    const lateSwitch = engine.switchMode('overwolf');
    releaseRestore();
    await Promise.all([restore, dispose, lateSwitch]);

    assert.deepEqual(events, [
      'vision:restore:start',
      'vision:restore:end',
      'vision:dispose',
      'overwolf:dispose',
    ]);
  });
});
