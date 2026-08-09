import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

describe('Draft Vision privacy wording', () => {
  it('discloses frame and local GSI processing without window-only claims', async () => {
    const [ipc, dashboard, settings, format] = await Promise.all([
      source('./ipc.ts'),
      source('../renderer/pages/dashboard.tsx'),
      source('../renderer/pages/settings.tsx'),
      source('../renderer/format.ts'),
    ]);
    const copy = `${ipc}\n${dashboard}\n${settings}\n${format}`;

    for (const required of [
      'локальный GSI-сигнал',
      'local GSI phase, team, and selected-hero signals',
      'Dota may include Steam IDs, player names, and other fields in the local GSI payload',
      'The raw hero ID/name stay in memory and are not sent or stored',
      'only the derived visual-group side and its source label accompany the frame',
      'All other GSI fields are immediately discarded',
      'window image changes substantially',
      'identical frames are not sent',
      'configured external recognition provider',
      'The source image is not stored',
    ]) {
      assert.equal(copy.includes(required), true, required);
    }
    for (const forbidden of [
      'Только окно Dota 2',
      'Только окно игры',
      'Dota 2 window only',
      'Game window only',
      'capture only the Dota 2 window',
      'Analyzing only the Dota 2 window',
      'Анализируем только окно Dota 2',
      'Steam IDs, player names, and game memory are never read',
      'GSI supplies only match phase and team',
      'GSI сообщает только фазу матча и команду',
      'Counterpick extracts only phase and team',
      'Counterpick извлекает только фазу и команду',
      'A frame goes to the API only when the draft changes',
      'Only a changed draft frame goes to the API',
      'Кадр уходит в API только при изменении драфта',
      'Кадр отправляется в API анализа только при изменении драфта',
    ]) {
      assert.equal(copy.includes(forbidden), false, forbidden);
    }
  });
});
