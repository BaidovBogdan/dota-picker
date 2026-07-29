import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(sourceDir, '..', 'output');

async function readJson(name) {
  try {
    return JSON.parse(await readFile(resolve(outputDir, name), 'utf8'));
  } catch {
    return null;
  }
}

const status = await readJson('status.json');
const latest = await readJson('latest.json');

if (!status) {
  process.stdout.write('GSI probe ещё не запускался.\n');
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  status,
  latest: latest
    ? {
        topLevelKeys: Object.keys(latest).sort(),
        map: latest.map ?? null,
        player: latest.player ?? null,
        hero: latest.hero ?? null,
        draft: latest.draft ?? null,
        allplayers: latest.allplayers ?? null,
      }
    : null,
}, null, 2)}\n`);
