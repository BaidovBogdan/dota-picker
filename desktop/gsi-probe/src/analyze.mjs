import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(sourceDir, '..', 'output');
const fileNames = (await readdir(outputDir))
  .filter((name) => name.startsWith('gsi-') && name.endsWith('.ndjson'))
  .sort();

const records = [];

for (const fileName of fileNames) {
  const content = await readFile(resolve(outputDir, fileName), 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (record.payload?.provider?.name === 'Dota 2') records.push(record);
  }
}

function heroEntries(payload) {
  const entries = Object.values(payload.minimap ?? {})
    .filter((entry) => entry?.unitname?.startsWith('npc_dota_hero_'))
    .map((entry) => ({
      name: entry.unitname.replace('npc_dota_hero_', ''),
      team: entry.team ?? null,
    }));

  return [...new Map(entries.map((entry) => [`${entry.team}:${entry.name}`, entry])).values()]
    .sort((left, right) => `${left.team}:${left.name}`.localeCompare(`${right.team}:${right.name}`));
}

function signature(payload) {
  return JSON.stringify({
    state: payload.map?.game_state ?? null,
    localHero: payload.hero?.name ?? null,
    heroes: heroEntries(payload),
    draft: payload.draft ?? null,
  });
}

const stateCounts = {};
const transitions = [];
let previousState = Symbol('initial');
let previousSignature = null;
let nonEmptyDraftPayloads = 0;

for (const record of records) {
  const payload = record.payload;
  const state = payload.map?.game_state ?? null;
  stateCounts[state ?? 'null'] = (stateCounts[state ?? 'null'] ?? 0) + 1;

  if (state !== previousState) {
    transitions.push({
      receivedAt: record.receivedAt,
      type: 'state',
      state,
    });
    previousState = state;
  }

  if (payload.draft && Object.keys(payload.draft).length > 0) {
    nonEmptyDraftPayloads += 1;
  }

  const currentSignature = signature(payload);
  if (currentSignature !== previousSignature) {
    const heroes = heroEntries(payload);
    transitions.push({
      receivedAt: record.receivedAt,
      type: 'draft-signal',
      state,
      localHero: payload.hero?.name?.replace('npc_dota_hero_', '') ?? null,
      draftKeys: Object.keys(payload.draft ?? {}).sort(),
      heroes,
      heroCount: new Set(heroes.map((entry) => entry.name)).size,
    });
    previousSignature = currentSignature;
  }
}

const report = {
  files: fileNames,
  realPayloads: records.length,
  firstReceivedAt: records.at(0)?.receivedAt ?? null,
  lastReceivedAt: records.at(-1)?.receivedAt ?? null,
  stateCounts,
  payloadsWithNonEmptyDraft: nonEmptyDraftPayloads,
  transitions,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
