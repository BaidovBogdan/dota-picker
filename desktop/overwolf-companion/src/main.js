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
  resetMatchState,
  snapshotFingerprint,
  supportsRequiredFeatures,
  unwrapInfoResult,
} from './protocol.js';

const requiredFeatures = DOTA_REQUIRED_FEATURES;
const companionVersion = '0.1.0';
const isControllerWindow = location.pathname.endsWith('/background.html');
const dotaState = createDotaState();
const reconnectBackoff = new ReconnectBackoff();
let connectionPhase = 'unpaired';
let socket = null;
let sequence = 0;
let lastSnapshotFingerprint = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let pairing = null;
let featureAttempt = 0;
let featureRetryTimer = null;
let featureRegistrationInFlight = false;
let gepStatus = 'waiting';
let currentWindowId = null;
const stateSubscribers = new Set();

const elements = {
  connection: document.querySelector('[data-connection]'),
  connectionDetail: document.querySelector('[data-connection-detail]'),
  game: document.querySelector('[data-game]'),
  draft: document.querySelector('[data-draft]'),
  picks: document.querySelector('[data-picks]'),
  retry: document.querySelector('[data-retry]'),
  minimize: document.querySelector('[data-minimize]'),
  close: document.querySelector('[data-close]'),
  drag: document.querySelector('[data-drag]'),
};

function publicState() {
  const snapshot = buildSnapshot(dotaState, sequence);
  snapshot.game.pseudoMatchId = null;
  return {
    connectionPhase,
    gepStatus,
    pairingConfigured: Boolean(pairing),
    snapshot,
  };
}

function subscribe(listener) {
  if (typeof listener !== 'function') return () => undefined;
  stateSubscribers.add(listener);
  listener(publicState());
  return () => stateSubscribers.delete(listener);
}

function applyPublicState(state) {
  if (!state || typeof state !== 'object' || !state.snapshot) return;
  connectionPhase = state.connectionPhase;
  gepStatus = state.gepStatus;
  pairing = state.pairingConfigured ? { configured: true } : null;
  const snapshot = state.snapshot;
  Object.assign(dotaState, {
    running: Boolean(snapshot.game?.running),
    matchState: snapshot.game?.matchState ?? null,
    playerTeam: snapshot.game?.playerTeam ?? null,
    localSteamId: null,
    localHeroId: snapshot.game?.localHeroId ?? null,
    localHeroName: snapshot.game?.localHeroName ?? null,
    localSlot: snapshot.game?.localSlot ?? null,
    localPosition: snapshot.game?.localPosition ?? null,
    pseudoMatchId: null,
    launchCommandConfigured: snapshot.game?.launchCommandConfigured ?? null,
    players: [],
    draft: snapshot.draft?.picks ?? [],
    bans: snapshot.draft?.bans ?? [],
  });
  sequence = Number.isInteger(snapshot.sequence) ? snapshot.sequence : sequence;
  render();
}

function storePairing(value) {
  pairing = value;
  connectionPhase = reduceConnectionPhase(connectionPhase, 'configured');
  render();
}

function clearTimer(timer) {
  if (timer) window.clearTimeout(timer);
  return null;
}

function setConnectionEvent(event) {
  connectionPhase = reduceConnectionPhase(connectionPhase, event);
  render();
}

function send(value) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(value));
  return true;
}

function sendDiagnostic(level, code, message) {
  send({
    version: PROTOCOL_VERSION,
    type: 'diagnostic',
    level,
    code,
    message,
    sentAt: Date.now(),
  });
}

function sendSnapshot() {
  if (connectionPhase !== 'connected') {
    render();
    return false;
  }
  const snapshot = buildSnapshot(dotaState, sequence + 1);
  const fingerprint = snapshotFingerprint(snapshot);
  if (fingerprint === lastSnapshotFingerprint) {
    render();
    return false;
  }
  if (!send(snapshot)) {
    render();
    return false;
  }
  sequence += 1;
  lastSnapshotFingerprint = fingerprint;
  render();
  return true;
}

function startHeartbeat(intervalMs = 5000) {
  heartbeatTimer = clearTimer(heartbeatTimer);
  const tick = () => {
    if (connectionPhase !== 'connected') return;
    send({
      version: PROTOCOL_VERSION,
      type: 'heartbeat',
      sequence: ++sequence,
      sentAt: Date.now(),
    });
    heartbeatTimer = window.setTimeout(tick, intervalMs);
  };
  heartbeatTimer = window.setTimeout(tick, intervalMs);
}

function scheduleReconnect() {
  reconnectTimer = clearTimer(reconnectTimer);
  if (!pairing) return;
  const delay = reconnectBackoff.nextDelay();
  reconnectTimer = window.setTimeout(connect, delay);
}

function connect() {
  reconnectTimer = clearTimer(reconnectTimer);
  heartbeatTimer = clearTimer(heartbeatTimer);
  if (!pairing) {
    setConnectionEvent('clear');
    return;
  }
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) socket.close();
  setConnectionEvent('connect');
  const nextSocket = new WebSocket(`ws://127.0.0.1:${pairing.port}/v1/live`);
  socket = nextSocket;
  nextSocket.addEventListener('open', () => {
    if (socket !== nextSocket) return;
    setConnectionEvent('open');
    send({
      version: PROTOCOL_VERSION,
      type: 'hello',
      sessionToken: pairing.token,
      companionVersion,
      extensionId: location.hostname || 'unpacked',
      sentAt: Date.now(),
    });
  });
  nextSocket.addEventListener('message', (event) => {
    if (socket !== nextSocket || typeof event.data !== 'string') return;
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      nextSocket.close(1007, 'Invalid server message');
      return;
    }
    if (message?.version !== PROTOCOL_VERSION || message.type !== 'hello-ack') return;
    reconnectBackoff.reset();
    sequence = 0;
    lastSnapshotFingerprint = null;
    setConnectionEvent('ack');
    startHeartbeat(Number.isInteger(message.heartbeatIntervalMs) ? message.heartbeatIntervalMs : 5000);
    sendDiagnostic('info', 'BRIDGE_CONNECTED', 'Authenticated local bridge connected');
    sendSnapshot();
  });
  nextSocket.addEventListener('close', () => {
    if (socket !== nextSocket) return;
    socket = null;
    heartbeatTimer = clearTimer(heartbeatTimer);
    setConnectionEvent('close');
    scheduleReconnect();
  });
  nextSocket.addEventListener('error', () => {
    if (socket === nextSocket) render();
  });
}

function acceptLaunchParameter(parameter) {
  const nextPairing = parsePairingUrl(parameter);
  if (!nextPairing) return false;
  storePairing(nextPairing);
  reconnectBackoff.reset();
  connect();
  return true;
}

function applyRunningGameInfo(result) {
  const gameInfo = result?.gameInfo ?? result;
  const wasRunning = dotaState.running;
  const running = Boolean(gameInfo?.isRunning && isDotaGame(gameInfo));
  const commandLine = String(
    gameInfo?.processCommandLine
    ?? gameInfo?.ProcessCommandLine
    ?? gameInfo?.commandLine
    ?? '',
  );
  dotaState.launchCommandConfigured = commandLine
    ? commandLine.toLowerCase().includes('-gamestateintegration')
    : null;
  if (!running) {
    resetMatchState(dotaState, false);
    featureRetryTimer = clearTimer(featureRetryTimer);
    featureAttempt = 0;
    gepStatus = 'waiting';
  } else {
    dotaState.running = true;
    if (!wasRunning) {
      featureRetryTimer = clearTimer(featureRetryTimer);
      featureAttempt = 0;
      registerFeatures();
    }
  }
  sendSnapshot();
}

function registerFeatures() {
  if (!dotaState.running || featureRegistrationInFlight) return;
  featureRetryTimer = clearTimer(featureRetryTimer);
  featureRegistrationInFlight = true;
  gepStatus = 'registering';
  overwolf.games.events.setRequiredFeatures(requiredFeatures, (result) => {
    featureRegistrationInFlight = false;
    if (!dotaState.running) return;
    const success = supportsRequiredFeatures(result, requiredFeatures);
    if (success) {
      featureAttempt = 0;
      gepStatus = 'ready';
      sendDiagnostic('info', 'GEP_FEATURES_READY', 'Dota 2 live features registered');
      overwolf.games.events.getInfo((result) => {
        const info = unwrapInfoResult(result);
        if (info) applyInfoUpdate(dotaState, info);
        sendSnapshot();
      });
      return;
    }
    featureAttempt += 1;
    if (featureAttempt >= 10) {
      gepStatus = 'error';
      if (featureAttempt === 10) {
        sendDiagnostic('error', 'GEP_FEATURES_UNAVAILABLE', 'Dota 2 live features are unavailable; background recovery remains active');
      }
    }
    const delay = featureRegistrationDelay(featureAttempt);
    featureRetryTimer = window.setTimeout(registerFeatures, delay);
    render();
  });
}

function retryAll() {
  if (dotaState.running) {
    featureAttempt = 0;
    featureRetryTimer = clearTimer(featureRetryTimer);
    gepStatus = 'registering';
    registerFeatures();
  }
  if (pairing) {
    reconnectBackoff.reset();
    connect();
  }
  render();
}

function showStatusWindow() {
  overwolf.windows.obtainDeclaredWindow('status', (result) => {
    const windowId = result?.window?.id;
    if (windowId) overwolf.windows.restore(windowId);
  });
}

function initializeOverwolf() {
  overwolf.windows.getCurrentWindow((result) => {
    currentWindowId = result?.window?.id ?? null;
  });
  overwolf.games.events.onInfoUpdates2.addListener((update) => {
    applyInfoUpdate(dotaState, update);
    sendSnapshot();
  });
  overwolf.games.events.onNewEvents.addListener((eventBatch) => {
    for (const event of eventBatch?.events ?? []) applyGameEvent(dotaState, event);
    sendSnapshot();
  });
  overwolf.games.events.onError.addListener(() => {
    sendDiagnostic('warn', 'GEP_RUNTIME_WARNING', 'Overwolf reported a Dota 2 event provider warning');
    if (dotaState.running && !featureRegistrationInFlight && !featureRetryTimer) {
      featureAttempt = 0;
      featureRetryTimer = window.setTimeout(registerFeatures, 1000);
    }
  });
  overwolf.games.onGameInfoUpdated.addListener((result) => applyRunningGameInfo(result));
  overwolf.games.getRunningGameInfo2((result) => applyRunningGameInfo(result));
  overwolf.extensions.onAppLaunchTriggered.addListener((event) => {
    if (event?.origin === 'urlscheme') acceptLaunchParameter(event.parameter);
    if (event?.origin !== 'gamelaunchevent') showStatusWindow();
  });
}

function render() {
  const state = publicState();
  for (const listener of stateSubscribers) listener(state);
  if (!elements.connection) return;
  const connectionLabels = {
    unpaired: ['Waiting for Counterpick', 'Choose Overwolf Live in the desktop app and press Connect.'],
    ready: ['Ready to connect', 'Pairing data received from Counterpick.'],
    connecting: ['Connecting', 'Opening the authenticated local channel.'],
    authenticating: ['Securing connection', 'Verifying the current Counterpick bridge token.'],
    connected: ['Connected', 'Exact draft events are flowing locally.'],
    reconnecting: ['Reconnecting', 'Counterpick is temporarily unavailable.'],
    error: ['Connection error', 'Open Counterpick and start a new connection.'],
  };
  const [connection, detail] = connectionLabels[connectionPhase] ?? connectionLabels.error;
  elements.connection.textContent = connection;
  elements.connectionDetail.textContent = detail;
  elements.connection.closest('[data-status-row]').dataset.state = connectionPhase;
  elements.game.textContent = dotaState.running
    ? gepStatus === 'error' ? 'Live data unavailable' : 'Detected'
    : 'Not running';
  elements.game.closest('[data-status-row]').dataset.state = gepStatus === 'error'
    ? 'error'
    : dotaState.running ? 'active' : 'idle';
  const inDraft = Boolean(
    dotaState.running
    && typeof dotaState.matchState === 'string'
    && (dotaState.matchState.includes('HERO_SELECTION') || dotaState.matchState.includes('STRATEGY_TIME')),
  );
  elements.draft.textContent = inDraft ? 'Hero selection' : 'Waiting';
  elements.draft.closest('[data-status-row]').dataset.state = inDraft ? 'active' : 'idle';
  const snapshot = buildSnapshot(dotaState, sequence);
  elements.picks.textContent = `${snapshot.draft.picks.length} / 10`;
  const connectionBusy = ['connecting', 'authenticating'].includes(connectionPhase);
  elements.retry.disabled = connectionBusy || (!pairing && !dotaState.running);
}

function initializeStatusWindow() {
  overwolf.windows.getCurrentWindow((result) => {
    currentWindowId = result?.window?.id ?? null;
  });
  const controllerWindow = overwolf.windows.getMainWindow();
  const controller = controllerWindow?.counterpickLive;
  if (!controller) {
    connectionPhase = 'error';
    render();
    return;
  }
  const unsubscribe = controller.subscribe(applyPublicState);
  window.addEventListener('unload', unsubscribe, { once: true });
  elements.retry?.addEventListener('click', () => controller.retry());
  elements.minimize?.addEventListener('click', () => {
    if (currentWindowId) overwolf.windows.minimize(currentWindowId);
  });
  elements.close?.addEventListener('click', () => {
    if (currentWindowId) overwolf.windows.close(currentWindowId);
  });
  elements.drag?.addEventListener('mousedown', () => {
    if (currentWindowId) overwolf.windows.dragMove(currentWindowId);
  });
}

if (isControllerWindow) {
  window.counterpickLive = Object.freeze({
    getState: publicState,
    subscribe,
    retry: retryAll,
    showStatusWindow,
  });
  render();
  initializeOverwolf();
  const initialPairing = parseInitialPairingUrl(location.href);
  if (initialPairing) {
    storePairing(initialPairing);
    reconnectBackoff.reset();
    connect();
    showStatusWindow();
  } else {
    const source = new URL(location.href).searchParams.get('source');
    if (source && source !== 'gamelaunchevent') showStatusWindow();
  }
} else {
  initializeStatusWindow();
}
