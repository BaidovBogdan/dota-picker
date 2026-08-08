import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import type { HeroMeta } from '../src/modules/heroes/heroes.types.js';
import { prepareDraftVisionInput } from '../src/modules/photo/draft-pick-bar.js';
import portraitIndex from '../src/modules/photo/hero-portrait-index.json' with { type: 'json' };
import { recognizeDraftWithPortraitIndex } from '../src/modules/photo/local-portrait-recognizer.js';

const heroes: HeroMeta[] = portraitIndex.heroes.map((hero) => ({
  id: hero.id,
  name: `npc_dota_hero_${hero.slug}`,
  localizedName: hero.name,
  primaryAttribute: 'agi',
  attackType: 'Melee',
  roles: [],
  imageUrl: '',
  iconUrl: '',
  picks: 1,
  wins: 1,
  winRate: 1,
}));

const cases = [
  {
    fixture: 'draft-current-1.webp',
    allyGroup: 'right',
    expected: ['enemy:2:30', 'enemy:4:51', 'ally:1:27', 'ally:2:110', 'ally:3:26'],
  },
  {
    fixture: 'draft-current-2.webp',
    allyGroup: 'right',
    expected: ['enemy:1:50', 'enemy:3:88', 'ally:1:14', 'ally:2:26'],
  },
  {
    fixture: 'draft-current-3.webp',
    allyGroup: 'left',
    expected: [
      'ally:0:8',
      'ally:2:68',
      'ally:3:123',
      'ally:4:104',
      'enemy:0:72',
      'enemy:1:30',
      'enemy:2:18',
      'enemy:4:137',
    ],
  },
  {
    fixture: 'draft-current-4.webp',
    allyGroup: 'left',
    expected: ['ally:0:8', 'ally:2:68', 'ally:3:123', 'enemy:0:72', 'enemy:1:30'],
  },
  {
    fixture: 'draft-current-5.webp',
    allyGroup: 'left',
    expected: ['ally:1:75', 'ally:4:31', 'enemy:0:100', 'enemy:2:7'],
  },
] as const;

const fixtureRoot = new URL('../test/fixtures/', import.meta.url);
const samples: number[] = [];
const results: {
  fixture: string;
  iteration: number;
  latencyMs: number;
  exact: boolean;
  picks: string[];
}[] = [];

for (const item of cases) {
  const image = await readFile(new URL(item.fixture, fixtureRoot));
  for (let iteration = 1; iteration <= 3; iteration += 1) {
    const startedAt = performance.now();
    const input = await prepareDraftVisionInput(image);
    const recognition = await recognizeDraftWithPortraitIndex(input, heroes, {
      allyGroup: item.allyGroup,
    });
    const latencyMs = performance.now() - startedAt;
    const picks = recognition?.recognized.map(
      (entry) => `${entry.side}:${entry.slot}:${entry.heroId}`,
    ) ?? [];
    const exact = JSON.stringify(picks) === JSON.stringify(item.expected);
    samples.push(latencyMs);
    results.push({
      fixture: item.fixture,
      iteration,
      latencyMs: Math.round(latencyMs * 10) / 10,
      exact,
      picks,
    });
  }
}

const ordered = samples.toSorted((left, right) => left - right);
const percentile = (ratio: number) => ordered[Math.ceil(ordered.length * ratio) - 1] ?? 0;
const summary = {
  cases: results.length,
  exact: results.filter((result) => result.exact).length,
  picks: cases.reduce((sum, item) => sum + item.expected.length, 0) * 3,
  latencyMs: {
    minimum: Math.round((ordered[0] ?? 0) * 10) / 10,
    median: Math.round(percentile(0.5) * 10) / 10,
    mean: Math.round(
      samples.reduce((sum, latency) => sum + latency, 0) / Math.max(1, samples.length) * 10,
    ) / 10,
    p95: Math.round(percentile(0.95) * 10) / 10,
    maximum: Math.round((ordered.at(-1) ?? 0) * 10) / 10,
  },
};

process.stdout.write(`${JSON.stringify({ summary, results }, null, 2)}\n`);
if (summary.exact !== summary.cases) process.exitCode = 1;
