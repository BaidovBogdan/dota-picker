export const PROTOCOL_VERSION = 1;
export const PAIRING_SCHEME = 'counterpick-overwolf-live';
export const DOTA_REQUIRED_FEATURES = Object.freeze([
  'roster',
  'me',
  'game',
  'game_state',
  'match_state_changed',
  'game_state_changed',
  'match_info',
]);

export function featureRegistrationDelay(attempt) {
  if (!Number.isInteger(attempt) || attempt < 1) return 1000;
  if (attempt >= 10) return 60000;
  return Math.min(15000, 1000 * (2 ** Math.min(attempt - 1, 4)));
}

export class ReconnectBackoff {
  constructor(random = Math.random) {
    this.random = random;
    this.attempt = 0;
  }

  nextDelay() {
    const base = Math.min(15000, 500 * (2 ** this.attempt));
    this.attempt = Math.min(this.attempt + 1, 8);
    return Math.round(base * (0.8 + this.random() * 0.4));
  }

  reset() {
    this.attempt = 0;
  }
}

export function reduceConnectionPhase(phase, event) {
  if (event === 'configured') return phase === 'connected' ? phase : 'ready';
  if (event === 'connect') return 'connecting';
  if (event === 'open') return 'authenticating';
  if (event === 'ack') return 'connected';
  if (event === 'close') return 'reconnecting';
  if (event === 'clear') return 'unpaired';
  if (event === 'fatal') return 'error';
  return phase;
}

const teamMap = new Map([
  ['radiant', 2],
  ['dire', 3],
  ['2', 2],
  ['3', 3],
]);

const dotaGameClassId = 7314;

export function createDotaState() {
  return {
    running: false,
    matchState: null,
    playerTeam: null,
    localSteamId: null,
    localHeroId: null,
    localHeroName: null,
    localSlot: null,
    localPosition: null,
    pseudoMatchId: null,
    launchCommandConfigured: null,
    players: [],
    draft: [],
    bans: [],
  };
}

export function resetMatchState(state, running, matchState = null) {
  state.running = running;
  state.matchState = matchState;
  state.playerTeam = null;
  state.localSteamId = null;
  state.localHeroId = null;
  state.localHeroName = null;
  state.localSlot = null;
  state.localPosition = null;
  state.pseudoMatchId = null;
  state.players = [];
  state.draft = [];
  state.bans = [];
  return state;
}

export function supportsRequiredFeatures(result, requiredFeatures) {
  const succeeded = result?.success === true || result?.status === 'success';
  if (!succeeded || !Array.isArray(result?.supportedFeatures)) return false;
  const supported = new Set(result.supportedFeatures);
  return requiredFeatures.every(feature => supported.has(feature));
}

export function parsePairingUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  let url;
  try {
    url = new URL(decoded);
  } catch {
    return null;
  }
  if (url.protocol !== `${PAIRING_SCHEME}:` || url.hostname !== 'connect') return null;
  const port = Number(url.searchParams.get('port'));
  const protocol = Number(url.searchParams.get('protocol'));
  const token = url.searchParams.get('token');
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (protocol !== PROTOCOL_VERSION || !token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return { port, token, protocol };
}

export function parseInitialPairingUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'overwolf-extension:' || url.searchParams.get('source') !== 'urlscheme') {
    return null;
  }
  const parameter = url.searchParams.get('parameter');
  return parameter ? parsePairingUrl(parameter) : null;
}

export function normalizeTeam(value) {
  if (value === null || value === undefined) return null;
  return teamMap.get(String(value).trim().toLowerCase()) ?? null;
}

export function normalizePositionRole(value) {
  const role = Number(value);
  if (role === 1) return 1;
  if (role === 4) return 2;
  if (role === 2) return 3;
  if (role === 8) return 4;
  if (role === 16) return 5;
  return null;
}

export function parseEmbeddedJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export function unwrapInfoResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('res' in value)) {
    return value;
  }
  if (value.success === false || !value.res || typeof value.res !== 'object') return null;
  return { info: value.res };
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nullableString(value, maxLength = 128) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function integerInRange(value, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export function isDotaGame(gameInfo) {
  if (!gameInfo || typeof gameInfo !== 'object' || Array.isArray(gameInfo)) return false;
  const classId = integerInRange(
    gameInfo.classId ?? gameInfo.gameClassId ?? gameInfo.GameInfoClassID,
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (classId !== null) return classId === dotaGameClassId;
  const fullId = integerInRange(
    gameInfo.id ?? gameInfo.gameId ?? gameInfo.GameInfoID,
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (fullId === null) return false;
  return fullId === dotaGameClassId || Math.floor(fullId / 10) === dotaGameClassId;
}

function normalizeTeamSlot(value, team) {
  const directSlot = integerInRange(value.team_slot, 0, 4);
  if (directSlot !== null) return directSlot;
  for (const candidate of [value.index, value.player_index]) {
    const playerIndex = integerInRange(candidate, 0, 9);
    if (playerIndex === null) continue;
    if (team === 2 && playerIndex <= 4) return playerIndex;
    if (team === 3 && playerIndex >= 5) return playerIndex - 5;
  }
  return null;
}

function parseArray(value) {
  const parsed = parseEmbeddedJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function applyMe(state, value) {
  const parsed = parseEmbeddedJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
  const nextTeam = normalizeTeam(parsed.team);
  if (nextTeam) state.playerTeam = nextTeam;
  const steamId = nullableString(parsed.steam_id ?? parsed.steamId, 32);
  if (steamId) state.localSteamId = steamId;
  const heroId = positiveInteger(parsed.heroId ?? parsed.hero_id);
  if (heroId) state.localHeroId = heroId;
  const heroName = nullableString(parsed.hero ?? parsed.heroName, 96);
  if (heroName) state.localHeroName = heroName;
}

function applyGame(state, value) {
  const parsed = parseEmbeddedJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
  const matchState = nullableString(parsed.match_state ?? parsed.matchState, 96);
  if (matchState) state.matchState = matchState;
  const gameState = nullableString(parsed.game_state ?? parsed.gameState, 32)?.toLowerCase();
  if (gameState) state.running = gameState === 'playing' || gameState === 'spectating';
  const nextTeam = normalizeTeam(parsed.player_team ?? parsed.playerTeam);
  if (nextTeam) state.playerTeam = nextTeam;
  const steamId = nullableString(parsed.player_steam_id ?? parsed.playerSteamId, 32);
  if (steamId) state.localSteamId = steamId;
}

function normalizePlayer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const team = normalizeTeam(value.team ?? value.teamId ?? value.team_id);
  if (!team) return null;
  return {
    team,
    heroId: positiveInteger(value.heroId ?? value.hero_id),
    heroName: nullableString(value.hero ?? value.heroName, 96),
    steamId: nullableString(value.steamId ?? value.steam_id, 32),
    slot: normalizeTeamSlot(value, team),
    position: normalizePositionRole(value.role),
    confirmed: value.pickConfirmed !== false && value.pick_confirmed !== false,
  };
}

function normalizeDraftPick(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const team = normalizeTeam(value.team ?? value.teamId ?? value.team_id);
  const heroId = positiveInteger(value.heroId ?? value.hero_id);
  if (!team || !heroId) return null;
  return {
    team,
    heroId,
    heroName: nullableString(value.hero ?? value.heroName, 96),
    slot: normalizeTeamSlot(value, team),
    confirmed: value.pickConfirmed !== false && value.pick_confirmed !== false,
  };
}

function refreshLocalPlayer(state) {
  const player = state.players.find((candidate) => (
    state.localSteamId && candidate.steamId === state.localSteamId
  )) ?? state.players.find((candidate) => (
    state.localHeroName && candidate.heroName === state.localHeroName
  ));
  if (!player) return;
  state.playerTeam = player.team;
  state.localSlot = player.slot;
  state.localPosition = player.position;
  state.localHeroId = player.heroId ?? state.localHeroId;
  state.localHeroName = player.heroName ?? state.localHeroName;
}

function applyRoster(state, value) {
  const parsed = parseEmbeddedJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
  if ('players' in parsed) {
    state.players = parseArray(parsed.players).map(normalizePlayer).filter(Boolean).slice(0, 10);
  }
  if ('draft' in parsed) {
    state.draft = parseArray(parsed.draft).map(normalizeDraftPick).filter(Boolean).slice(0, 10);
  }
  if ('bans' in parsed) {
    state.bans = [...new Set(parseArray(parsed.bans)
      .map((item) => positiveInteger(item?.heroId ?? item?.hero_id ?? item))
      .filter(Boolean))].slice(0, 20);
  }
  refreshLocalPlayer(state);
}

function applyMatchInfo(state, value) {
  const parsed = parseEmbeddedJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
  const matchId = nullableString(parsed.pseudo_match_id ?? parsed.pseudoMatchId, 128);
  if (matchId) state.pseudoMatchId = matchId;
}

export function applyInfoUpdate(state, update) {
  if (!update || typeof update !== 'object') return state;
  if (update.info && typeof update.info === 'object') {
    if (update.info.me) applyMe(state, update.info.me);
    if (update.info.game) applyGame(state, update.info.game);
    if (update.info.roster) applyRoster(state, update.info.roster);
    if (update.info.match_info) applyMatchInfo(state, update.info.match_info);
  }
  const category = nullableString(update.category, 64)?.toLowerCase();
  const key = nullableString(update.key, 128)?.toLowerCase();
  const value = parseEmbeddedJson(update.value);
  if (category === 'me' && key) applyMe(state, { [key]: value });
  if (category === 'game' && key) applyGame(state, { [key]: value });
  if (category === 'roster' && key) applyRoster(state, { [key]: value });
  if (category === 'match_info' && key) applyMatchInfo(state, { [key]: value });
  refreshLocalPlayer(state);
  return state;
}

export function applyGameEvent(state, event) {
  if (!event || typeof event !== 'object') return state;
  const data = parseEmbeddedJson(event.data);
  if (event.name === 'game_state_changed') applyGame(state, data);
  if (event.name === 'match_state_changed') applyGame(state, data);
  if (event.name === 'new_game') {
    resetMatchState(state, true);
    applyGame(state, data);
  }
  if (event.name === 'game_over') {
    resetMatchState(state, true, 'DOTA_GAMERULES_STATE_POST_GAME');
  }
  return state;
}

function draftPicks(state) {
  const picks = state.draft.map(pick => ({ ...pick }));
  for (const player of state.players) {
    if (!player.heroId) continue;
    const currentIndex = picks.findIndex(pick => (
      pick.team === player.team
      && pick.slot !== null
      && player.slot !== null
      && pick.slot === player.slot
    ));
    const fallbackIndex = currentIndex >= 0
      ? currentIndex
      : picks.findIndex(pick => (
          pick.team === player.team
          && pick.heroId === player.heroId
          && (pick.slot === null || player.slot === null)
        ));
    const current = fallbackIndex >= 0 ? picks[fallbackIndex] : null;
    const next = {
      heroId: player.heroId,
      heroName: player.heroName ?? current?.heroName ?? null,
      team: player.team,
      slot: player.slot ?? current?.slot ?? null,
      confirmed: player.confirmed && (current?.confirmed ?? true),
    };
    if (fallbackIndex >= 0) picks[fallbackIndex] = next;
    else picks.push(next);
  }
  const byStableSlot = new Map();
  for (const pick of picks) {
    const key = pick.slot === null
      ? `${pick.team}:hero:${pick.heroId}`
      : `${pick.team}:slot:${pick.slot}`;
    byStableSlot.set(key, pick);
  }
  const merged = [...byStableSlot.values()];
  const heroTeams = new Map();
  for (const pick of merged) {
    const teams = heroTeams.get(pick.heroId) ?? new Set();
    teams.add(pick.team);
    heroTeams.set(pick.heroId, teams);
  }
  return merged.slice(0, 10).map(pick => ({
    ...pick,
    confirmed: pick.confirmed && heroTeams.get(pick.heroId)?.size === 1,
  }));
}

export function buildSnapshot(state, sequence, sentAt = Date.now()) {
  return {
    version: PROTOCOL_VERSION,
    type: 'snapshot',
    sequence,
    sentAt,
    game: {
      running: Boolean(state.running),
      matchState: nullableString(state.matchState, 96),
      playerTeam: normalizeTeam(state.playerTeam),
      localHeroId: positiveInteger(state.localHeroId),
      localHeroName: nullableString(state.localHeroName, 96),
      localSlot: Number.isInteger(state.localSlot) ? state.localSlot : null,
      localPosition: [1, 2, 3, 4, 5].includes(state.localPosition) ? state.localPosition : null,
      pseudoMatchId: nullableString(state.pseudoMatchId, 128),
      launchCommandConfigured: typeof state.launchCommandConfigured === 'boolean'
        ? state.launchCommandConfigured
        : null,
    },
    draft: {
      picks: draftPicks(state),
      bans: [...new Set(state.bans.map(positiveInteger).filter(Boolean))].slice(0, 20),
    },
  };
}
