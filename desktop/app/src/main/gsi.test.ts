import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createGsiConfig,
  parseGsiPayload,
  resolveGsiHeroAllyGroup,
  resolveGsiHeroSignal,
  resolveGsiTeam,
} from './gsi.ts';

describe('GSI team orientation', () => {
  it('requests the privacy-scoped hero category needed for automatic orientation', () => {
    const config = createGsiConfig(32123, 'token');

    assert.match(config, /"map" "1"/);
    assert.match(config, /"player" "1"/);
    assert.match(config, /"hero" "1"/);
  });

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
      hero: {
        id: 27,
        name: 'npc_dota_hero_shadow_shaman',
        health: 560,
        xpm: 0,
      },
    });

    assert.deepEqual(payload.player, { team_name: 'dire' });
    assert.deepEqual(payload.hero, {
      id: 27,
      name: 'npc_dota_hero_shadow_shaman',
    });
    assert.equal(resolveGsiTeam(payload), 'dire');
    assert.deepEqual(resolveGsiHeroSignal(payload), {
      id: 27,
      name: 'npc_dota_hero_shadow_shaman',
    });
    assert.equal(JSON.stringify(payload).includes('76561198000000000'), false);
    assert.equal(JSON.stringify(payload).includes('private-player-name'), false);
  });

  it('accepts the pre-pick zero hero without dropping map or team data', () => {
    const payload = parseGsiPayload({
      map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
      player: { team_name: 'radiant' },
      hero: { id: 0, name: '' },
    });

    assert.equal(payload.map?.game_state, 'DOTA_GAMERULES_STATE_HERO_SELECTION');
    assert.equal(resolveGsiTeam(payload), 'radiant');
    assert.equal(resolveGsiHeroSignal(payload), null);
  });

  it('maps a single high-confidence local hero match to its whole visual group', () => {
    const recognized = [
      {
        heroId: 27,
        heroName: 'npc_dota_hero_shadow_shaman',
        confidence: 0.93,
        visualGroup: 'left' as const,
      },
      {
        heroId: 74,
        heroName: 'npc_dota_hero_invoker',
        confidence: 0.92,
        visualGroup: 'right' as const,
      },
    ];

    assert.equal(resolveGsiHeroAllyGroup({ id: 27, name: null }, recognized), 'left');
    assert.equal(resolveGsiHeroAllyGroup({ id: null, name: 'npc_dota_hero_invoker' }, recognized), 'right');
  });

  it('fails closed for weak, missing or ambiguous local hero evidence', () => {
    const weak = [{
      heroId: 27,
      heroName: 'npc_dota_hero_shadow_shaman',
      confidence: 0.79,
      visualGroup: 'left' as const,
    }];
    const ambiguous = [
      { ...weak[0], confidence: 0.93 },
      { ...weak[0], confidence: 0.94, visualGroup: 'right' as const },
    ];

    assert.equal(resolveGsiHeroAllyGroup({ id: 27, name: null }, weak), null);
    assert.equal(resolveGsiHeroAllyGroup({ id: 27, name: null }, ambiguous), null);
    assert.equal(resolveGsiHeroAllyGroup({ id: 74, name: null }, ambiguous), null);
    assert.equal(resolveGsiHeroAllyGroup(null, ambiguous), null);
  });
});
