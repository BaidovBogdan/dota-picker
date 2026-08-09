import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  Hero,
  OverwolfBridgeState,
  Preferences,
} from '../shared/contracts.ts';
import type { ApiClient } from './api-client.ts';
import type { DiagnosticEventDraft } from './diagnostics.ts';
import { DesktopError } from './errors.ts';
import type { OverwolfBridge } from './overwolf-bridge.ts';
import {
  OverwolfDraftEngine,
  normalizeOverwolfDraft,
} from './overwolf-draft-engine.ts';
import type { OverwolfSnapshotMessage } from './overwolf-protocol.ts';
import type { PreferencesStore } from './preferences-store.ts';

function snapshot(
  patch: Partial<OverwolfSnapshotMessage['game']> = {},
): OverwolfSnapshotMessage {
  return {
    version: 1,
    type: 'snapshot',
    sequence: 1,
    sentAt: Date.now(),
    game: {
      running: true,
      matchState: 'DOTA_GAMERULES_STATE_HERO_SELECTION',
      playerTeam: 2,
      localHeroId: 25,
      localHeroName: 'npc_dota_hero_lina',
      localSlot: 2,
      localPosition: 2,
      pseudoMatchId: null,
      launchCommandConfigured: true,
      ...patch,
    },
    draft: {
      picks: [
        { heroId: 1, heroName: 'antimage', team: 2, slot: 0, confirmed: true },
        { heroId: 25, heroName: 'lina', team: 2, slot: 2, confirmed: true },
        { heroId: 14, heroName: 'pudge', team: 3, slot: 0, confirmed: true },
        { heroId: 26, heroName: 'lion', team: 3, slot: 1, confirmed: true },
        { heroId: 14, heroName: 'pudge', team: 3, slot: null, confirmed: false },
        { heroId: 75, heroName: 'silencer', team: 3, slot: 2, confirmed: false },
      ],
      bans: [75, 75, 14, 76],
    },
  };
}

function officialSnapshot(sequence = 1): OverwolfSnapshotMessage {
  const value = snapshot({ localHeroId: null, localSlot: 2 });
  return {
    ...value,
    sequence,
    draft: {
      picks: [
        { heroId: 1, heroName: null, team: 2, slot: null, confirmed: true },
        { heroId: 25, heroName: null, team: 2, slot: null, confirmed: true },
        { heroId: 14, heroName: null, team: 3, slot: null, confirmed: true },
        { heroId: 26, heroName: null, team: 3, slot: null, confirmed: true },
      ],
      bans: [],
    },
  };
}

const heroes: Hero[] = [
  { id: 1, name: 'npc_dota_hero_antimage', localizedName: 'Anti-Mage' },
  { id: 14, name: 'npc_dota_hero_pudge', localizedName: 'Pudge' },
  { id: 25, name: 'npc_dota_hero_lina', localizedName: 'Lina' },
  { id: 26, name: 'npc_dota_hero_lion', localizedName: 'Lion' },
  { id: 27, name: 'npc_dota_hero_shadow_shaman', localizedName: 'Shadow Shaman' },
  { id: 28, name: 'npc_dota_hero_slardar', localizedName: 'Slardar' },
  { id: 29, name: 'npc_dota_hero_tidehunter', localizedName: 'Tidehunter' },
];

function officialDraftSnapshot(
  sequence: number,
  enemyHeroIds: number[],
  pseudoMatchId = 'match-alpha',
): OverwolfSnapshotMessage {
  const value = officialSnapshot(sequence);
  return {
    ...value,
    game: { ...value.game, pseudoMatchId },
    draft: {
      picks: [
        ...value.draft.picks.filter((pick) => pick.team === 2),
        ...enemyHeroIds.map((heroId, slot) => ({
          heroId,
          heroName: null,
          team: 3 as const,
          slot,
          confirmed: true,
        })),
      ],
      bans: [],
    },
  };
}

class FakeBridge {
  private snapshotListeners = new Set<(snapshot: OverwolfSnapshotMessage) => void>();
  private stateListeners = new Set<(state: OverwolfBridgeState) => void>();
  private state: OverwolfBridgeState = {
    phase: 'connected',
    configured: true,
    protocolVersion: 1,
    port: 45241,
    connectedAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
    lastError: null,
    companionVersion: 'test',
    gameDetected: true,
    draftActive: true,
  };

  getState(): OverwolfBridgeState {
    return structuredClone(this.state);
  }

  onSnapshot(listener: (snapshot: OverwolfSnapshotMessage) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  onState(listener: (state: OverwolfBridgeState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  async start(): Promise<OverwolfBridgeState> {
    this.state = {
      ...this.state,
      phase: 'connected',
      connectedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      gameDetected: true,
      draftActive: true,
    };
    return this.getState();
  }

  async connect(): Promise<OverwolfBridgeState> {
    return this.start();
  }

  async dispose(): Promise<void> {
    this.state = {
      ...this.state,
      phase: 'stopped',
      connectedAt: null,
      lastMessageAt: null,
      gameDetected: false,
      draftActive: false,
    };
  }

  emitSnapshot(value: OverwolfSnapshotMessage): void {
    this.state.lastMessageAt = new Date().toISOString();
    for (const listener of this.snapshotListeners) listener(structuredClone(value));
  }

  setPhase(phase: OverwolfBridgeState['phase']): void {
    this.state = {
      ...this.state,
      phase,
      connectedAt: phase === 'connected' ? new Date().toISOString() : null,
      gameDetected: phase === 'connected',
      draftActive: phase === 'connected',
    };
    for (const listener of this.stateListeners) listener(this.getState());
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function analysisResponse(id: string, revision = 0) {
  return {
    analysis: { id },
    quota: { remaining: 7 },
    liveSession: {
      token: `${revision}`.repeat(64).slice(0, 64),
      revision,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for test state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function createHarness(
  analyzeOverwolf: (...arguments_: unknown[]) => Promise<ReturnType<typeof analysisResponse>>,
  reviseOverwolf: (...arguments_: unknown[]) => Promise<ReturnType<typeof analysisResponse>> = async (
    analysisId,
  ) => analysisResponse(String(analysisId), 1),
) {
  let preferencesValue: Preferences = {
    theme: 'system',
    language: 'en',
    position: 3,
    rank: null,
    startWithWindows: false,
    minimizeToTray: true,
    overlayShortcut: 'PageUp',
    wishlist: [],
    assistantEnabled: false,
    assistantMode: 'overwolf',
    captureConsent: { accepted: false, acceptedAt: null },
    overwolfConsent: { accepted: true, acceptedAt: new Date().toISOString() },
    diagnosticsConsent: { accepted: false, acceptedAt: null, version: null },
  };
  const preferences = {
    get: async () => structuredClone(preferencesValue),
    setAssistantEnabled: async (enabled: boolean) => {
      preferencesValue = { ...preferencesValue, assistantEnabled: enabled };
      return structuredClone(preferencesValue);
    },
  } as unknown as PreferencesStore;
  const api = {
    heroes: async () => ({ heroes }),
    analyzeOverwolf,
    reviseOverwolf,
  } as unknown as ApiClient;
  const bridge = new FakeBridge();
  const diagnostics: DiagnosticEventDraft[] = [];
  const engine = new OverwolfDraftEngine(
    api,
    preferences,
    bridge as unknown as OverwolfBridge,
    () => undefined,
    { info: () => undefined, warn: () => undefined, error: () => undefined },
    (event) => diagnostics.push(structuredClone(event)),
  );
  return { bridge, diagnostics, engine };
}

describe('normalizeOverwolfDraft', () => {
  it('removes the local hero, unconfirmed picks and picked bans', () => {
    assert.deepEqual(normalizeOverwolfDraft(snapshot(), 3, 5, true), {
      position: 2,
      rank: 5,
      allyHeroIds: [1],
      enemyHeroIds: [14, 26],
      bannedHeroIds: [75, 76],
    });
  });

  it('falls back to the selected position and requires a known player team', () => {
    assert.equal(normalizeOverwolfDraft(snapshot({ playerTeam: null }), 4, null, true), null);
    assert.equal(normalizeOverwolfDraft(snapshot({ localPosition: 2 }), 4, null, false)?.position, 4);
  });

  it('can identify the local hero by normalized name when an ID is unavailable', () => {
    const value = snapshot({ localHeroId: null, localSlot: null, localHeroName: 'npc_dota_hero_lina' });
    assert.deepEqual(normalizeOverwolfDraft(value, 3, null, true)?.allyHeroIds, [1]);
  });

  it('enriches official-shaped roster hero slugs before excluding the local draft pick', () => {
    const value = officialSnapshot();
    assert.equal(normalizeOverwolfDraft(value, 3, null, true), null);
    assert.deepEqual(
      normalizeOverwolfDraft(value, 3, null, true, new Map([['lina', 25]])),
      {
        position: 2,
        rank: null,
        allyHeroIds: [1],
        enemyHeroIds: [14, 26],
        bannedHeroIds: [],
      },
    );
  });

  it('waits when five allied picks arrive before the local player can be identified', () => {
    const value = officialSnapshot();
    value.game.localHeroId = null;
    value.game.localHeroName = null;
    value.game.localSlot = null;
    value.draft.picks = [
      ...[1, 2, 3, 4, 5].map((heroId, slot) => ({
        heroId,
        heroName: null,
        team: 2 as const,
        slot,
        confirmed: true,
      })),
      { heroId: 14, heroName: null, team: 3, slot: 0, confirmed: true },
      { heroId: 26, heroName: null, team: 3, slot: 1, confirmed: true },
    ];
    assert.equal(normalizeOverwolfDraft(value, 3, null, true), null);

    value.game.localHeroId = 99;
    assert.equal(normalizeOverwolfDraft(value, 3, null, true), null);
  });

  it('fails closed for corrupted roster sizes, duplicate heroes and occupied slots', () => {
    const sixAllies = officialSnapshot();
    sixAllies.game.localHeroId = 6;
    sixAllies.game.localHeroName = null;
    sixAllies.game.localSlot = 5;
    sixAllies.draft.picks = [1, 2, 3, 4, 5, 6].map((heroId, slot) => ({
      heroId,
      heroName: null,
      team: 2 as const,
      slot,
      confirmed: true,
    }));
    assert.equal(normalizeOverwolfDraft(sixAllies, 3, null, true), null);

    const sixEnemies = officialSnapshot();
    sixEnemies.draft.picks.push(
      ...[30, 31, 32, 33].map((heroId, index) => ({
        heroId,
        heroName: null,
        team: 3 as const,
        slot: index + 2,
        confirmed: true,
      })),
    );
    assert.equal(normalizeOverwolfDraft(sixEnemies, 3, null, true), null);

    const duplicateHero = officialSnapshot();
    duplicateHero.draft.picks.push({
      heroId: 14,
      heroName: null,
      team: 2,
      slot: 4,
      confirmed: true,
    });
    assert.equal(normalizeOverwolfDraft(duplicateHero, 3, null, true), null);

    const duplicateSlot = officialSnapshot();
    duplicateSlot.draft.picks[1] = {
      ...duplicateSlot.draft.picks[1]!,
      slot: 0,
    };
    assert.equal(normalizeOverwolfDraft(duplicateSlot, 3, null, true), null);
  });
});

describe('OverwolfDraftEngine lifecycle', () => {
  it('starts a new scoped analysis when the live capability expires', async () => {
    let analyses = 0;
    let revisions = 0;
    const { bridge, engine } = createHarness(
      async () => {
        analyses += 1;
        return analysisResponse(analyses === 1 ? 'analysis-initial' : 'analysis-recovered');
      },
      async () => {
        revisions += 1;
        throw new DesktopError(
          'OVERWOLF_LIVE_SESSION_INVALID',
          'The Overwolf live session is invalid or expired',
          401,
        );
      },
    );

    await engine.setEnabled(true);
    bridge.emitSnapshot(officialDraftSnapshot(2, [14, 26]));
    await waitFor(() => engine.getState().latestAnalysisId === 'analysis-initial');
    bridge.emitSnapshot(officialDraftSnapshot(3, [14, 26, 27]));
    await waitFor(() => engine.getState().latestAnalysisId === 'analysis-recovered');

    assert.equal(analyses, 2);
    assert.equal(revisions, 1);
    await engine.dispose();
  });

  it('keeps bridge subscriptions active across updater suspend and recovery', async () => {
    let calls = 0;
    const { bridge, engine } = createHarness(async () => {
      calls += 1;
      return analysisResponse('analysis-after-recovery');
    });

    await engine.setEnabled(true);
    await engine.suspend();
    await engine.restore();
    bridge.emitSnapshot(snapshot({ pseudoMatchId: 'update-recovery-match' }));
    await waitFor(() => calls === 1);

    assert.equal(engine.getState().latestAnalysisId, 'analysis-after-recovery');
    await engine.dispose();
  });

  it('builds synthetic recognition only from normalized confirmed picks', async () => {
    const { bridge, engine } = createHarness(async () => analysisResponse('analysis-1'));
    await engine.setEnabled(true);
    bridge.emitSnapshot(snapshot({ pseudoMatchId: 'recognition-match' }));
    await waitFor(() => engine.getState().recognition !== null);

    assert.deepEqual(
      engine.getState().recognition?.recognized.map((entry) => [entry.side, entry.heroId]),
      [['ally', 1], ['enemy', 14], ['enemy', 26]],
    );
    await engine.dispose();
  });

  it('emits privacy-safe recognition and request diagnostics', async () => {
    const { bridge, diagnostics, engine } = createHarness(async () => analysisResponse('analysis-1'));
    await engine.setEnabled(true);
    bridge.emitSnapshot(snapshot({ pseudoMatchId: 'diagnostic-match' }));
    await waitFor(() => engine.getState().phase === 'ready');

    const recognition = diagnostics.find((event) => event.type === 'recognition_result');
    const requestStarted = diagnostics.find((event) => event.type === 'request_started');
    const requestCompleted = diagnostics.find((event) => event.type === 'request_completed');
    assert.ok(recognition?.type === 'recognition_result');
    assert.ok(requestStarted?.type === 'request_started');
    assert.ok(requestCompleted?.type === 'request_completed');
    assert.equal(recognition.details.revision, requestStarted.details.revision);
    assert.equal(requestCompleted.details.revision, requestStarted.details.revision);
    assert.deepEqual(
      recognition.details.slots.map((slot) => [slot.side, slot.heroId]),
      [['ally', 1], ['enemy', 14], ['enemy', 26]],
    );
    const serialized = JSON.stringify(diagnostics);
    for (const forbidden of ['playerName', 'steamId', 'token', 'rawGsi', 'screenshot', 'image']) {
      assert.equal(serialized.includes(forbidden), false);
    }
    await engine.dispose();
  });

  it('marks a complete confirmed draft as completed when gameplay starts', async () => {
    const { bridge, diagnostics, engine } = createHarness(async () => analysisResponse('analysis-1'));
    const complete = snapshot({ pseudoMatchId: 'completed-match' });
    complete.draft.picks = [
      ...[1, 25, 27, 28, 29].map((heroId, slot) => ({
        heroId,
        heroName: null,
        team: 2 as const,
        slot,
        confirmed: true,
      })),
      ...[14, 26, 30, 31, 32].map((heroId, slot) => ({
        heroId,
        heroName: null,
        team: 3 as const,
        slot,
        confirmed: true,
      })),
    ];
    await engine.setEnabled(true);
    bridge.emitSnapshot(complete);
    await waitFor(() => engine.getState().draftActive);
    bridge.emitSnapshot({
      ...complete,
      sequence: complete.sequence + 1,
      game: { ...complete.game, matchState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' },
    });
    await waitFor(() => !engine.getState().draftActive);

    const ended = diagnostics.find((event) => event.type === 'draft_ended');
    assert.ok(ended?.type === 'draft_ended');
    assert.equal(ended.details.reason, 'completed');
    await engine.dispose();
  });

  it('uses one quota-backed analysis and revises it through a complete 2-to-5 enemy draft', async () => {
    const analyzedDrafts: unknown[] = [];
    const revisedDrafts: unknown[] = [];
    const { bridge, engine } = createHarness(
      async (draft) => {
        analyzedDrafts.push(draft);
        return analysisResponse('analysis-live');
      },
      async (analysisId, draft) => {
        assert.equal(analysisId, 'analysis-live');
        revisedDrafts.push(draft);
        return analysisResponse('analysis-live');
      },
    );
    await engine.setEnabled(true);
    const enemies = [14, 26, 27, 28, 29];
    for (let count = 2; count <= enemies.length; count += 1) {
      bridge.emitSnapshot(officialDraftSnapshot(count, enemies.slice(0, count)));
      await waitFor(() => analyzedDrafts.length + revisedDrafts.length === count - 1);
      await waitFor(() => engine.getState().phase === 'ready');
    }

    assert.equal(analyzedDrafts.length, 1);
    assert.deepEqual(
      revisedDrafts.map((value) => (value as { enemyHeroIds: number[] }).enemyHeroIds.length),
      [3, 4, 5],
    );
    assert.equal(engine.getState().latestAnalysisId, 'analysis-live');
    await engine.dispose();
  });

  it('coalesces same-draft snapshots received during analysis without leaving refresh pending', async () => {
    const response = deferred<ReturnType<typeof analysisResponse>>();
    let calls = 0;
    const { bridge, engine } = createHarness(async () => {
      calls += 1;
      return response.promise;
    });
    await engine.setEnabled(true);
    bridge.emitSnapshot(officialSnapshot(1));
    await waitFor(() => calls === 1);
    bridge.emitSnapshot(officialSnapshot(2));
    response.resolve(analysisResponse('analysis-1'));
    await waitFor(() => engine.getState().phase === 'ready');
    await new Promise((resolve) => setTimeout(resolve, 550));
    assert.equal(calls, 1);
    assert.equal(engine.getState().refreshPending, false);
    assert.equal(engine.getState().latestAnalysisId, 'analysis-1');
    await engine.dispose();
  });

  it('does not reuse a stale draft after disable and re-enable', async () => {
    let calls = 0;
    const { bridge, engine } = createHarness(async () => {
      calls += 1;
      return analysisResponse(`analysis-${calls}`);
    });
    await engine.setEnabled(true);
    bridge.emitSnapshot(officialSnapshot(1));
    await engine.setEnabled(false);
    await new Promise((resolve) => setTimeout(resolve, 550));
    await engine.setEnabled(true);
    await new Promise((resolve) => setTimeout(resolve, 550));
    assert.equal(calls, 0);
    bridge.emitSnapshot(officialSnapshot(2));
    await waitFor(() => calls === 1);
    await engine.dispose();
  });

  it('ignores an old in-flight result after disable and re-enable in the same match', async () => {
    const oldResponse = deferred<ReturnType<typeof analysisResponse>>();
    let analyzeCalls = 0;
    let reviseCalls = 0;
    const { bridge, engine } = createHarness(
      async () => {
        analyzeCalls += 1;
        return analyzeCalls === 1
          ? oldResponse.promise
          : analysisResponse('analysis-fresh');
      },
      async () => {
        reviseCalls += 1;
        return analysisResponse('unexpected-revision', 1);
      },
    );
    await engine.setEnabled(true);
    bridge.emitSnapshot(officialDraftSnapshot(1, [14, 26], 'same-match'));
    await waitFor(() => analyzeCalls === 1);
    await engine.setEnabled(false);
    await engine.setEnabled(true);
    bridge.emitSnapshot(officialDraftSnapshot(2, [14, 26], 'same-match'));
    oldResponse.resolve(analysisResponse('analysis-stale'));

    await waitFor(() => analyzeCalls === 2);
    await waitFor(() => engine.getState().latestAnalysisId === 'analysis-fresh');
    assert.equal(reviseCalls, 0);
    await engine.dispose();
  });

  it('starts a new quota-backed session after disable when no match ID is available', async () => {
    let analyzeCalls = 0;
    let reviseCalls = 0;
    const { bridge, engine } = createHarness(
      async () => analysisResponse(`analysis-${analyzeCalls += 1}`),
      async () => {
        reviseCalls += 1;
        return analysisResponse('unexpected-revision', reviseCalls);
      },
    );
    await engine.setEnabled(true);
    bridge.emitSnapshot(officialSnapshot(1));
    await waitFor(() => engine.getState().phase === 'ready');
    await engine.setEnabled(false);
    await engine.setEnabled(true);
    bridge.emitSnapshot(officialSnapshot(2));
    await waitFor(() => analyzeCalls === 2);

    assert.equal(reviseCalls, 0);
    await engine.dispose();
  });

  it('captures the match analysis ID after disconnect and resumes with a revision', async () => {
    const firstResponse = deferred<ReturnType<typeof analysisResponse>>();
    let analyzeCalls = 0;
    let reviseCalls = 0;
    const { bridge, engine } = createHarness(
      async () => {
        analyzeCalls += 1;
        return firstResponse.promise;
      },
      async (analysisId) => {
        reviseCalls += 1;
        assert.equal(analysisId, 'analysis-live');
        return analysisResponse('analysis-live');
      },
    );
    await engine.setEnabled(true);
    bridge.emitSnapshot(officialDraftSnapshot(1, [14, 26]));
    await waitFor(() => analyzeCalls === 1);
    bridge.setPhase('listening');
    firstResponse.resolve(analysisResponse('analysis-live'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(engine.getState().latestAnalysisId, null);
    bridge.setPhase('connected');
    await new Promise((resolve) => setTimeout(resolve, 550));
    assert.equal(analyzeCalls, 1);
    bridge.emitSnapshot(officialDraftSnapshot(2, [14, 26, 27]));
    await waitFor(() => reviseCalls === 1);
    await waitFor(() => engine.getState().latestAnalysisId === 'analysis-live');
    assert.equal(analyzeCalls, 1);
    await engine.dispose();
  });
});
