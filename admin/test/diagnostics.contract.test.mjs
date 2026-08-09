import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const typesUrl = new URL('../src/types.ts', import.meta.url);
const clientUrl = new URL('../src/api/client.ts', import.meta.url);
const diagnosticsUrl = new URL('../src/lib/diagnostics.ts', import.meta.url);
const diagnosticsPageUrl = new URL('../src/pages/diagnostics.tsx', import.meta.url);
const appUrl = new URL('../src/App.tsx', import.meta.url);

test('admin consumes the privacy-safe diagnostic session contract', async () => {
  const [types, client, diagnostics] = await Promise.all([
    readFile(typesUrl, 'utf8'),
    readFile(clientUrl, 'utf8'),
    readFile(diagnosticsUrl, 'utf8'),
  ]);

  assert.match(types, /export type DiagnosticEventType =\s*\| 'app_started'[\s\S]*?\| 'app_stopped';/);
  assert.match(types, /slots\?: AdminDiagnosticSlot\[\]/);
  assert.match(client, /`\/diagnostics\/sessions\$\{queryString\(query\)\}`/);
  assert.match(client, /`\/diagnostics\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\$\{queryString\(query\)\}`/);
  assert.match(types, /events: AdminDiagnosticEvent\[\];[\s\S]*?nextBeforeSequence: number \| null;/);
  assert.match(types, /beforeSequence\?: number;/);
  assert.doesNotMatch(types.slice(types.indexOf('export type AdminDiagnosticSessionQuery'), types.indexOf('export type AdminDiagnosticSessionsQuery')), /offset/);
  assert.match(types, /'crash' \| 'rollover'/);
  assert.match(types, /visibleSlots\?: AdminDiagnosticVisibleSlot\[\]/);
  assert.match(types, /orientationSource\?: 'gsi_player_hero' \| 'manual_confirmation' \| 'overwolf' \| null/);
  assert.doesNotMatch(types, /frameTag/);
  assert.match(diagnostics, /recognition_result: 'Распознавание завершено'/);
});

test('diagnostic UI resolves heroes once and exposes overlay visibility without N+1 calls', async () => {
  const page = await readFile(diagnosticsPageUrl, 'utf8');

  assert.match(page, /heroCatalog: PageResource<HeroCatalogResponse>/);
  assert.match(page, /new Map\(\(heroCatalog\.data\?\.heroes \?\? \[\]\)\.map/);
  assert.match(page, /function OverlayVisibleSlots/);
  assert.match(page, /details\?\.visibleSlots/);
  assert.match(page, /DiagnosticHero heroId=\{slot\.heroId\}/);
  assert.match(page, /Слот \{slot\.slot \+ 1\}/);
  assert.doesNotMatch(page, /Frame tag|frameTag/);
  assert.match(page, /event\.type === 'engine_error' && details\.stage/);
  assert.match(page, /Этап ошибки/);
  assert.match(page, /Каталог героев недоступен — показываем сохранённые ID/);
  assert.doesNotMatch(page, /adminApi|fetch\(/);
});

test('diagnostic exact-ID search waits for a complete UUID', async () => {
  const page = await readFile(diagnosticsPageUrl, 'utf8');

  assert.match(page, /const uuidPattern =/);
  assert.match(page, /if \(!queryIsValid\) return;/);
  assert.match(page, /частичный ID не отправляется/);
});

test('older diagnostic pages are merged once and kept chronological', async () => {
  const { mergeDiagnosticEvents } = await import('../src/lib/diagnostics.ts');
  const current = [
    { id: 'event-3', sequence: 3 },
    { id: 'event-4', sequence: 4 },
  ];
  const older = [
    { id: 'event-1', sequence: 1 },
    { id: 'event-2', sequence: 2 },
    { id: 'event-3', sequence: 3 },
  ];

  assert.deepEqual(mergeDiagnosticEvents(current, older).map((event) => event.id), [
    'event-1',
    'event-2',
    'event-3',
    'event-4',
  ]);
});

test('diagnostic detail pagination follows the server keyset cursor', async () => {
  const app = await readFile(appUrl, 'utf8');

  assert.match(app, /\{ limit: 500, beforeSequence \}/);
  assert.match(app, /pagination\.nextBeforeSequence/);
  assert.match(app, /beforeSequence !== undefined/);
  assert.match(app, /total: current\.pagination\.total/);
  assert.doesNotMatch(app, /diagnosticSession\.data\?\.events\.length/);
});

test('diagnostic UI types do not add forbidden remote payload fields', async () => {
  const types = await readFile(typesUrl, 'utf8');
  const diagnosticTypes = types.slice(
    types.indexOf('export type DiagnosticMode'),
    types.indexOf('export type AdminReviewHero'),
  );

  for (const forbidden of ['email:', 'deviceId:', 'ip:', 'screenshot', 'framePath', 'stack:', 'token:', 'rawInput', 'rawResult']) {
    assert.doesNotMatch(diagnosticTypes, new RegExp(forbidden, 'i'));
  }
});
