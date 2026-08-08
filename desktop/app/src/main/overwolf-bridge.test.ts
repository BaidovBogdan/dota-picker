import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import WebSocket from 'ws';
import {
  normalizeOverwolfBridgePort,
  normalizeOverwolfStoreUrl,
  OverwolfBridge,
} from './overwolf-bridge.ts';
import { activateOverwolfLive } from '../shared/overwolf-connect-flow.ts';

type LogEntry = { level: string; values: unknown[] };

function createHarness(storeUrl: string | null = null, pairingTimeoutMs?: number) {
  const logs: LogEntry[] = [];
  const states: string[] = [];
  const openedUrls: string[] = [];
  const logger = {
    info: (...values: unknown[]) => logs.push({ level: 'info', values }),
    warn: (...values: unknown[]) => logs.push({ level: 'warn', values }),
    error: (...values: unknown[]) => logs.push({ level: 'error', values }),
  };
  const bridge = new OverwolfBridge({
    port: 0,
    storeUrl,
    openExternal: async (url) => {
      openedUrls.push(url);
    },
    onState: (state) => states.push(state.phase),
    logger,
    pairingTimeoutMs,
  });
  return { bridge, logs, states, openedUrls };
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
}

function waitForMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data) => {
      try {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    socket.once('error', reject);
  });
}

function waitForClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once('close', (code) => resolve(code)));
}

describe('OverwolfBridge', () => {
  it('uses an ephemeral port by default while preserving valid explicit overrides', () => {
    assert.equal(normalizeOverwolfBridgePort(undefined), 0);
    assert.equal(normalizeOverwolfBridgePort(''), 0);
    assert.equal(normalizeOverwolfBridgePort('45241'), 45241);
    assert.equal(normalizeOverwolfBridgePort('70000'), 0);
    assert.equal(normalizeOverwolfBridgePort('45241junk'), 0);
  });

  it('accepts only an HTTPS listing on the official Overwolf Appstore host', async () => {
    assert.equal(
      normalizeOverwolfStoreUrl('https://www.overwolf.com/app/counterpick-live'),
      'https://www.overwolf.com/app/counterpick-live',
    );
    for (const unsafeUrl of [
      'counterpick://install',
      'http://www.overwolf.com/app/counterpick-live',
      'https://www.overwolf.com.evil.example/app/counterpick-live',
      'https://download.overwolf.com/install/counterpick-live',
      'not-a-url',
    ]) {
      const harness = createHarness(unsafeUrl);
      assert.equal(harness.bridge.getState().configured, false);
      await assert.rejects(() => harness.bridge.openInstaller(), {
        code: 'OVERWOLF_RELEASE_UNCONFIGURED',
      });
      assert.deepEqual(harness.openedUrls, []);
    }

    const harness = createHarness('https://overwolf.com/app/counterpick-live');
    assert.equal(harness.bridge.getState().configured, true);
    await harness.bridge.openInstaller();
    assert.deepEqual(harness.openedUrls, ['https://overwolf.com/app/counterpick-live']);
  });

  it('stays stopped until a consent-gated caller explicitly starts it', () => {
    const harness = createHarness();
    assert.equal(harness.bridge.getState().phase, 'stopped');
    assert.equal(harness.bridge.getState().port, null);
    assert.deepEqual(harness.openedUrls, []);
  });

  it('opens one pairing URL for Vision activation and allows retry after timeout', async () => {
    const harness = createHarness(null, 20);
    try {
      await activateOverwolfLive({
        consentAcceptedAt: '2026-08-08T10:00:00.000Z',
        updatePreferences: async () => ({ assistantMode: 'overwolf' as const }),
        setEnabled: async () => {
          await harness.bridge.start();
          await harness.bridge.connect();
        },
        connect: () => harness.bridge.connect(),
      });

      assert.equal(harness.bridge.getState().phase, 'pairing');
      assert.equal(harness.openedUrls.length, 1);
      await new Promise((resolve) => setTimeout(resolve, 35));
      assert.equal(harness.bridge.getState().phase, 'listening');
      assert.equal(
        harness.bridge.getState().lastError,
        'Overwolf Live не подключился. Проверьте companion и повторите попытку.',
      );
      await harness.bridge.connect();
      assert.equal(harness.openedUrls.length, 2);
    } finally {
      await harness.bridge.dispose();
    }
  });

  it('authenticates one loopback client, publishes state and redacts secrets from diagnostics', async () => {
    const harness = createHarness();
    try {
      const listening = await harness.bridge.start();
      assert.equal(listening.phase, 'listening');
      assert.ok(listening.port);
      await harness.bridge.connect();
      const pairingUrl = new URL(harness.openedUrls.at(-1) as string);
      assert.equal(pairingUrl.protocol, 'counterpick-overwolf-live:');
      const token = pairingUrl.searchParams.get('token') as string;
      const socket = new WebSocket(`ws://127.0.0.1:${listening.port}/v1/live`);
      await waitForOpen(socket);
      const acknowledgement = waitForMessage(socket);
      socket.send(JSON.stringify({
        version: 1,
        type: 'hello',
        sessionToken: token,
        companionVersion: '0.1.0-test',
        extensionId: 'test-extension',
        sentAt: Date.now(),
      }));
      assert.equal((await acknowledgement).type, 'hello-ack');
      socket.send(JSON.stringify({
        version: 1,
        type: 'snapshot',
        sequence: 1,
        sentAt: Date.now(),
        game: {
          running: true,
          matchState: 'DOTA_GAMERULES_STATE_HERO_SELECTION',
          playerTeam: 2,
          localHeroId: null,
          localHeroName: null,
          localSlot: null,
          localPosition: 3,
          pseudoMatchId: 'private-match-id',
          launchCommandConfigured: true,
        },
        draft: {
          picks: [
            { heroId: 14, heroName: 'pudge', team: 3, slot: 0, confirmed: true },
            { heroId: 25, heroName: 'lina', team: 2, slot: 1, confirmed: true },
          ],
          bans: [75],
        },
      }));
      socket.send(JSON.stringify({
        version: 1,
        type: 'diagnostic',
        level: 'warn',
        code: 'TEST_REDACTION',
        message: `personal@example.com token=${token}`,
        sentAt: Date.now(),
      }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const state = harness.bridge.getState();
      assert.equal(state.phase, 'connected');
      assert.equal(state.gameDetected, true);
      assert.equal(state.draftActive, true);
      const serializedLogs = JSON.stringify(harness.logs);
      assert.equal(serializedLogs.includes(token), false);
      assert.equal(serializedLogs.includes('private-match-id'), false);
      assert.equal(serializedLogs.includes('personal@example.com'), false);
      const closed = waitForClose(socket);
      socket.close();
      await closed;
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(harness.bridge.getState().phase, 'listening');
      assert.deepEqual(
        harness.states.filter((phase, index, values) => values[index - 1] !== phase),
        ['listening', 'pairing', 'connected', 'listening'],
      );
    } finally {
      await harness.bridge.dispose();
    }
  });

  it('rejects invalid credentials and rotates the session token after restart', async () => {
    const harness = createHarness();
    try {
      const first = await harness.bridge.start();
      await harness.bridge.connect();
      const firstToken = new URL(harness.openedUrls.at(-1) as string).searchParams.get('token');
      const socket = new WebSocket(`ws://127.0.0.1:${first.port}/v1/live`);
      await waitForOpen(socket);
      const close = waitForClose(socket);
      socket.send(JSON.stringify({
        version: 1,
        type: 'hello',
        sessionToken: 'f'.repeat(64),
        companionVersion: '0.1.0-test',
        extensionId: 'test-extension',
        sentAt: Date.now(),
      }));
      assert.equal(await close, 1008);
      await harness.bridge.dispose();
      await harness.bridge.start();
      await harness.bridge.connect();
      const secondToken = new URL(harness.openedUrls.at(-1) as string).searchParams.get('token');
      assert.notEqual(firstToken, secondToken);
    } finally {
      await harness.bridge.dispose();
    }
  });
});
