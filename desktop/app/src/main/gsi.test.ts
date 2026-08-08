import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseGsiPayload,
  resolveConfiguredAllyGroup,
  resolveGsiTeam,
} from './gsi.ts';

describe('GSI team orientation', () => {
  it('reads the exact team_name capture shape while stripping player identity fields', () => {
    const payload = parseGsiPayload({
      auth: { token: 'private-token' },
      map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
      player: {
        team_name: 'dire',
        steamid: '76561198000000000',
        accountid: '123456789',
        name: 'private-player-name',
      },
    });

    assert.deepEqual(payload.player, { team_name: 'dire' });
    assert.equal(resolveGsiTeam(payload), 'dire');
    assert.equal(JSON.stringify(payload).includes('76561198000000000'), false);
    assert.equal(JSON.stringify(payload).includes('private-player-name'), false);
  });

  it('derives screen side only after explicit Radiant placement calibration', () => {
    assert.equal(resolveConfiguredAllyGroup('radiant', null), null);
    assert.equal(resolveConfiguredAllyGroup('radiant', 'left'), 'left');
    assert.equal(resolveConfiguredAllyGroup('dire', 'left'), 'right');
    assert.equal(resolveConfiguredAllyGroup('radiant', 'right'), 'right');
    assert.equal(resolveConfiguredAllyGroup('dire', 'right'), 'left');
  });
});
