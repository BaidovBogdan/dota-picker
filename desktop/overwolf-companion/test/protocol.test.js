import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DOTA_REQUIRED_FEATURES,
  PROTOCOL_VERSION,
  ReconnectBackoff,
  applyGameEvent,
  applyInfoUpdate,
  buildSnapshot,
  createDotaState,
  featureRegistrationDelay,
  isDotaGame,
  parseInitialPairingUrl,
  parsePairingUrl,
  reduceConnectionPhase,
  snapshotFingerprint,
  supportsRequiredFeatures,
  unwrapInfoResult,
} from '../src/protocol.js';

describe('pairing protocol', () => {
  it('accepts only the expected loopback launch parameters', () => {
    const token = 'a'.repeat(64);
    assert.deepEqual(
      parsePairingUrl(`counterpick-overwolf-live://connect?port=45241&protocol=1&token=${token}`),
      { port: 45241, protocol: PROTOCOL_VERSION, token },
    );
    assert.equal(parsePairingUrl(`https://example.com/?port=45241&protocol=1&token=${token}`), null);
    assert.equal(parsePairingUrl('counterpick-overwolf-live://connect?port=0&protocol=1&token=bad'), null);
    assert.equal(parsePairingUrl('counterpick-overwolf-live://other?port=45241&protocol=1&token=' + token), null);
    const wrapped = new URL('overwolf-extension://counterpick-live/main.html');
    wrapped.searchParams.set('source', 'urlscheme');
    wrapped.searchParams.set(
      'parameter',
      encodeURIComponent(`counterpick-overwolf-live://connect?port=45241&protocol=1&token=${token}`),
    );
    assert.deepEqual(parseInitialPairingUrl(wrapped.toString()), {
      port: 45241,
      protocol: PROTOCOL_VERSION,
      token,
    });
    wrapped.searchParams.set('source', 'dock');
    assert.equal(parseInitialPairingUrl(wrapped.toString()), null);
  });

  it('uses capped exponential reconnect delays and resets after success', () => {
    const backoff = new ReconnectBackoff(() => 0.5);
    assert.deepEqual(
      [backoff.nextDelay(), backoff.nextDelay(), backoff.nextDelay(), backoff.nextDelay()],
      [500, 1000, 2000, 4000],
    );
    for (let index = 0; index < 10; index += 1) backoff.nextDelay();
    assert.equal(backoff.nextDelay(), 15000);
    backoff.reset();
    assert.equal(backoff.nextDelay(), 500);
  });

  it('keeps connection transitions deterministic', () => {
    let phase = 'unpaired';
    for (const event of ['configured', 'connect', 'open', 'ack']) {
      phase = reduceConnectionPhase(phase, event);
    }
    assert.equal(phase, 'connected');
    phase = reduceConnectionPhase(phase, 'close');
    assert.equal(phase, 'reconnecting');
    phase = reduceConnectionPhase(phase, 'clear');
    assert.equal(phase, 'unpaired');
  });

  it('requires every requested GEP feature to be reported as supported', () => {
    const required = ['roster', 'me', 'game'];
    assert.equal(supportsRequiredFeatures({
      success: true,
      supportedFeatures: required,
    }, required), true);
    assert.equal(supportsRequiredFeatures({
      success: true,
      supportedFeatures: ['roster', 'game'],
    }, required), false);
    assert.equal(supportsRequiredFeatures({ success: true }, required), false);
    assert.equal(DOTA_REQUIRED_FEATURES.includes('game_state'), true);
  });

  it('keeps low-frequency GEP recovery active after fast retries are exhausted', () => {
    assert.deepEqual(
      [1, 2, 3, 9, 10, 11, 100].map(featureRegistrationDelay),
      [1000, 2000, 4000, 15000, 60000, 60000, 60000],
    );
  });
});

describe('Dota 2 snapshot normalization', () => {
  it('recognizes both native class IDs and full instance IDs without accepting nearby games', () => {
    assert.equal(isDotaGame({ classId: 7314, id: 99999 }), true);
    assert.equal(isDotaGame({ id: 73143 }), true);
    assert.equal(isDotaGame({ gameId: 7314 }), true);
    assert.equal(isDotaGame({ GameInfoID: 73149 }), true);
    assert.equal(isDotaGame({ classId: 5426, id: 73143 }), false);
    assert.equal(isDotaGame({ id: 7315 }), false);
    assert.equal(isDotaGame(null), false);
  });

  it('combines GEP roster, local player, draft and match state without forwarding Steam ID', () => {
    const state = createDotaState();
    applyInfoUpdate(state, {
      info: {
        me: { team: 'radiant', steam_id: '76561198000000000', hero: 'lina' },
        game: { game_state: 'playing', match_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
        match_info: { pseudo_match_id: 'private-match-value' },
        roster: {
          players: JSON.stringify([
            { steamId: '76561198000000000', team: 2, heroId: 25, hero: 'lina', role: 4, team_slot: 2 },
            { steamId: '', team: 3, heroId: 14, hero: 'pudge', role: 2, team_slot: 0 },
          ]),
          draft: JSON.stringify([
            { heroId: 25, team: 2 },
            { heroId: 14, team: 3 },
          ]),
          bans: JSON.stringify([{ heroId: 75 }]),
        },
      },
    });
    const snapshot = buildSnapshot(state, 7, 1000);
    assert.equal(snapshot.game.playerTeam, 2);
    assert.equal(snapshot.game.localHeroId, 25);
    assert.equal(snapshot.game.localSlot, 2);
    assert.equal(snapshot.game.localPosition, 2);
    assert.equal(snapshot.draft.picks.length, 2);
    assert.deepEqual(snapshot.draft.bans, [75]);
    assert.equal(JSON.stringify(snapshot).includes('76561198000000000'), false);
  });

  it('treats sequence, timestamp and source ordering as transport noise while preserving a new pick', () => {
    const state = createDotaState();
    Object.assign(state, {
      running: true,
      matchState: 'DOTA_GAMERULES_STATE_HERO_SELECTION',
      playerTeam: 2,
      draft: [
        { heroId: 25, heroName: 'lina', team: 2, slot: 1, confirmed: true },
        { heroId: 14, heroName: 'pudge', team: 3, slot: 0, confirmed: true },
      ],
      bans: [75],
    });
    const first = buildSnapshot(state, 1, 1000);
    const repeated = {
      ...buildSnapshot(state, 99, 2000),
      draft: { ...buildSnapshot(state, 99, 2000).draft, picks: [...first.draft.picks].reverse() },
    };

    assert.equal(snapshotFingerprint(first), snapshotFingerprint(repeated));
    state.draft.push({ heroId: 26, heroName: 'lion', team: 3, slot: 1, confirmed: true });
    assert.notEqual(snapshotFingerprint(first), snapshotFingerprint(buildSnapshot(state, 100, 3000)));
  });

  it('preserves the official slug-only player identity beside ID-only draft picks', () => {
    const state = createDotaState();
    applyInfoUpdate(state, {
      info: {
        me: { team: 'radiant', hero: 'slark' },
        roster: {
          players: JSON.stringify([
            { team: 'radiant', hero: 'slark', team_slot: 2, pick_confirmed: true },
            { team: 'dire', hero: 'pudge', team_slot: 0, pick_confirmed: true },
          ]),
          draft: JSON.stringify([
            { team: 'radiant', hero_id: 93 },
            { team: 'dire', hero_id: 14 },
          ]),
        },
      },
    });

    const snapshot = buildSnapshot(state, 1, 1000);
    assert.equal(snapshot.game.playerTeam, 2);
    assert.equal(snapshot.game.localHeroName, 'slark');
    assert.equal(snapshot.game.localHeroId, null);
    assert.equal(snapshot.game.localSlot, 2);
    assert.deepEqual(snapshot.draft.picks.map((pick) => [pick.team, pick.heroId]), [
      [2, 93],
      [3, 14],
    ]);
  });

  it('prefers Immortal Draft team slots and normalizes standard roster indexes per team', () => {
    const state = createDotaState();
    applyInfoUpdate(state, {
      info: {
        me: { team: 'dire', hero: 'local_hero' },
        roster: {
          players: JSON.stringify([
            { team: 3, heroId: 1, hero: 'local_hero', team_slot: 4, index: 5, player_index: 6 },
            { team: 2, heroId: 2, hero: 'radiant_index', index: 3 },
            { team: 3, heroId: 3, hero: 'dire_index', index: 8 },
            { team: 3, heroId: 4, hero: 'dire_player_index', player_index: 6 },
          ]),
        },
      },
    });
    const snapshot = buildSnapshot(state, 1, 1000);
    assert.equal(snapshot.game.localSlot, 4);
    assert.deepEqual(
      snapshot.draft.picks.map((pick) => [pick.heroId, pick.slot]),
      [[1, 4], [2, 3], [3, 3], [4, 1]],
    );
  });

  it('tracks game event transitions and clears draft on game over', () => {
    const state = createDotaState();
    applyGameEvent(state, {
      name: 'game_state_changed',
      data: JSON.stringify({
        game_state: 'playing',
        match_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION',
        player_team: 'dire',
      }),
    });
    state.draft = [{ heroId: 14, heroName: 'pudge', team: 2, slot: 0, confirmed: true }];
    applyGameEvent(state, { name: 'game_over', data: '' });
    assert.equal(state.matchState, 'DOTA_GAMERULES_STATE_POST_GAME');
    assert.deepEqual(state.draft, []);
  });

  it('clears every match-scoped field on game over and on a new game boundary', () => {
    const state = createDotaState();
    Object.assign(state, {
      running: true,
      matchState: 'DOTA_GAMERULES_STATE_HERO_SELECTION',
      playerTeam: 3,
      localSteamId: 'private',
      localHeroId: 14,
      localHeroName: 'pudge',
      localSlot: 2,
      localPosition: 3,
      pseudoMatchId: 'old-match',
      launchCommandConfigured: true,
      players: [{ team: 3, heroId: 14 }],
      draft: [{ heroId: 14, team: 3, slot: 2, confirmed: true }],
      bans: [75],
    });

    applyGameEvent(state, { name: 'game_over', data: '' });
    assert.deepEqual(buildSnapshot(state, 1, 1000), {
      version: PROTOCOL_VERSION,
      type: 'snapshot',
      sequence: 1,
      sentAt: 1000,
      game: {
        running: true,
        matchState: 'DOTA_GAMERULES_STATE_POST_GAME',
        playerTeam: null,
        localHeroId: null,
        localHeroName: null,
        localSlot: null,
        localPosition: null,
        pseudoMatchId: null,
        launchCommandConfigured: true,
      },
      draft: { picks: [], bans: [] },
    });

    Object.assign(state, {
      playerTeam: 2,
      localHeroId: 25,
      players: [{ team: 2, heroId: 25 }],
      draft: [{ heroId: 25, team: 2, slot: 1, confirmed: true }],
      pseudoMatchId: 'stale-without-game-over',
    });
    applyGameEvent(state, {
      name: 'new_game',
      data: JSON.stringify({ game_state: 'playing' }),
    });
    const next = buildSnapshot(state, 2, 2000);
    assert.equal(next.game.running, true);
    assert.equal(next.game.playerTeam, null);
    assert.equal(next.game.localHeroId, null);
    assert.equal(next.game.pseudoMatchId, null);
    assert.deepEqual(next.draft, { picks: [], bans: [] });
  });

  it('keeps same-hero team collisions separate and unconfirmed until the round resolves', () => {
    const state = createDotaState();
    applyInfoUpdate(state, {
      info: {
        roster: {
          draft: JSON.stringify([
            { team: 2, heroId: 14 },
            { team: 3, heroId: 14 },
          ]),
          players: JSON.stringify([
            { team: 2, heroId: 14, index: 1, pickConfirmed: false },
            { team: 3, heroId: 14, index: 7, pickConfirmed: false },
          ]),
        },
      },
    });

    const picks = buildSnapshot(state, 1, 1000).draft.picks;
    assert.equal(picks.length, 2);
    assert.deepEqual(picks.map((pick) => [pick.team, pick.slot, pick.confirmed]), [
      [2, 1, false],
      [3, 2, false],
    ]);
  });

  it('unwraps the official getInfo result before applying its payload', () => {
    const payload = {
      game: { game_state: 'playing', match_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' },
      me: { team: 'dire', hero: 'pudge' },
      roster: {
        players: JSON.stringify([{ team: 3, heroId: 14, hero: 'pudge', index: 7 }]),
        draft: JSON.stringify([{ team: 3, heroId: 14 }]),
      },
      match_info: { pseudo_match_id: 'private-match-value' },
    };
    const update = unwrapInfoResult({ success: true, error: null, res: payload });
    assert.deepEqual(update, { info: payload });
    const state = createDotaState();
    applyInfoUpdate(state, update);
    const snapshot = buildSnapshot(state, 1, 1000);
    assert.equal(snapshot.game.running, true);
    assert.equal(snapshot.game.playerTeam, 3);
    assert.equal(snapshot.game.localHeroId, 14);
    assert.equal(snapshot.game.localSlot, 2);
    assert.deepEqual(snapshot.draft.picks.map((pick) => pick.heroId), [14]);
    assert.equal(unwrapInfoResult({ success: false, error: 'Unavailable', res: null }), null);
    assert.deepEqual(unwrapInfoResult({ info: payload }), { info: payload });
  });
});
