import { performance } from 'node:perf_hooks';
import {
  overwolfClientMessageSchema,
  overwolfSnapshotFingerprint,
  type OverwolfSnapshotMessage,
} from '../src/main/overwolf-protocol.ts';

type Measurement = {
  outboundSnapshots: number;
  bridgeListenerEmits: number;
  wireBytes: number;
  elapsedMs: number;
};

const requestedRepeats = Number(process.argv[2] ?? '10000');
const repeatedSnapshots = Number.isInteger(requestedRepeats)
  ? Math.min(100_000, Math.max(1, requestedRepeats))
  : 10_000;

function createSnapshot(sequence: number, enemyHeroIds: number[]): OverwolfSnapshotMessage {
  return {
    version: 1,
    type: 'snapshot',
    sequence,
    sentAt: 1_750_000_000_000 + sequence,
    game: {
      running: true,
      matchState: 'DOTA_GAMERULES_STATE_HERO_SELECTION',
      playerTeam: 2,
      localHeroId: 25,
      localHeroName: 'npc_dota_hero_lina',
      localSlot: 2,
      localPosition: 2,
      pseudoMatchId: 'local-benchmark-match',
      launchCommandConfigured: true,
    },
    draft: {
      picks: [
        { heroId: 1, heroName: 'npc_dota_hero_antimage', team: 2, slot: 0, confirmed: true },
        { heroId: 25, heroName: 'npc_dota_hero_lina', team: 2, slot: 2, confirmed: true },
        ...enemyHeroIds.map((heroId, index) => ({
          heroId,
          heroName: `npc_dota_hero_enemy_${heroId}`,
          team: 3 as const,
          slot: index,
          confirmed: true,
        })),
      ],
      bans: [75, 76, 77],
    },
  };
}

function processBridgeSnapshot(snapshot: OverwolfSnapshotMessage): number {
  const wire = JSON.stringify(snapshot);
  const parsed = overwolfClientMessageSchema.parse(JSON.parse(wire));
  structuredClone(parsed);
  return Buffer.byteLength(wire);
}

function measureEverySnapshot(stream: readonly OverwolfSnapshotMessage[]): Measurement {
  const startedAt = performance.now();
  let wireBytes = 0;
  for (const snapshot of stream) wireBytes += processBridgeSnapshot(snapshot);
  return {
    outboundSnapshots: stream.length,
    bridgeListenerEmits: stream.length,
    wireBytes,
    elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
  };
}

function measureSemanticDedupe(stream: readonly OverwolfSnapshotMessage[]): Measurement {
  const startedAt = performance.now();
  let previousFingerprint: string | null = null;
  let outboundSnapshots = 0;
  let wireBytes = 0;
  for (const snapshot of stream) {
    const fingerprint = overwolfSnapshotFingerprint(snapshot);
    if (fingerprint === previousFingerprint) continue;
    previousFingerprint = fingerprint;
    outboundSnapshots += 1;
    wireBytes += processBridgeSnapshot(snapshot);
  }
  return {
    outboundSnapshots,
    bridgeListenerEmits: outboundSnapshots,
    wireBytes,
    elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
  };
}

function reduction(before: number, after: number): number {
  return Number((((before - after) / before) * 100).toFixed(2));
}

const repeated = createSnapshot(1, [14, 26]);
const stream = Array.from({ length: repeatedSnapshots }, (_, index) => ({
  ...repeated,
  sequence: index + 1,
  sentAt: repeated.sentAt + index,
}));
stream.push(createSnapshot(repeatedSnapshots + 1, [14, 26, 27]));

const before = measureEverySnapshot(stream);
const after = measureSemanticDedupe(stream);

console.log(JSON.stringify({
  scenario: {
    kind: 'local synthetic benchmark',
    sourceEvents: stream.length,
    repeatedUnchangedEvents: Math.max(0, repeatedSnapshots - 1),
    finalEvent: 'new enemy pick',
    pipeline: 'JSON encode/decode + Zod validation + structured clone per emitted snapshot',
  },
  before,
  after,
  reduction: {
    outboundSnapshotsPercent: reduction(before.outboundSnapshots, after.outboundSnapshots),
    bridgeListenerEmitsPercent: reduction(before.bridgeListenerEmits, after.bridgeListenerEmits),
    wireBytesPercent: reduction(before.wireBytes, after.wireBytes),
    elapsedMsPercent: reduction(before.elapsedMs, after.elapsedMs),
  },
}, null, 2));
