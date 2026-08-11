import { randomBytes, timingSafeEqual } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import type { OverwolfBridgeState } from '../shared/contracts.js';
import { DesktopError } from './errors.js';
import {
  OVERWOLF_BRIDGE_PROTOCOL_VERSION,
  OVERWOLF_PAIRING_SCHEME,
  overwolfSnapshotFingerprint,
  overwolfClientMessageSchema,
  type OverwolfServerMessage,
  type OverwolfSnapshotMessage,
} from './overwolf-protocol.js';

type BridgeLogger = {
  info: (message: string, ...details: unknown[]) => void;
  warn: (message: string, ...details: unknown[]) => void;
  error: (message: string, ...details: unknown[]) => void;
};

type OverwolfBridgeOptions = {
  port: number;
  storeUrl: string | null;
  openExternal: (url: string) => Promise<void>;
  onState: (state: OverwolfBridgeState) => void;
  logger: BridgeLogger;
  pairingTimeoutMs?: number;
};

const heartbeatIntervalMs = 5_000;
const staleAfterMs = 16_000;
const terminateAfterMs = 45_000;
const helloTimeoutMs = 7_500;
const defaultPairingTimeoutMs = 15_000;
const maxClockSkewMs = 5 * 60_000;
const overwolfStoreHosts = new Set(['overwolf.com', 'www.overwolf.com']);

export function normalizeOverwolfBridgePort(value: string | undefined): number {
  if (!value?.trim()) return 0;
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 && port <= 65_535 ? port : 0;
}

export function normalizeOverwolfStoreUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:'
      || !overwolfStoreHosts.has(url.hostname)
      || !url.pathname.startsWith('/app/')
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isLoopbackAddress(value: string | undefined): boolean {
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
}

function errorSummary(error: unknown): { name: string; code: string | number | null } {
  if (!(error instanceof Error)) return { name: 'UnknownError', code: null };
  const code = 'code' in error && (typeof error.code === 'string' || typeof error.code === 'number')
    ? error.code
    : null;
  return { name: error.name || 'Error', code };
}

function closeSocket(socket: WebSocket, code: number, reason: string): void {
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close(code, reason.slice(0, 120));
  }
}

export class OverwolfBridge {
  private readonly options: OverwolfBridgeOptions;
  private server: WebSocketServer | null = null;
  private activeSocket: WebSocket | null = null;
  private token: string | null = null;
  private staleTimer: NodeJS.Timeout | null = null;
  private pairingTimer: NodeJS.Timeout | null = null;
  private startPromise: Promise<OverwolfBridgeState> | null = null;
  private disposing = false;
  private lastSequence = -1;
  private lastSnapshotFingerprint: string | null = null;
  private readonly snapshotListeners = new Set<(snapshot: OverwolfSnapshotMessage) => void>();
  private readonly stateListeners = new Set<(state: OverwolfBridgeState) => void>();
  private state: OverwolfBridgeState;

  constructor(options: OverwolfBridgeOptions) {
    this.options = {
      ...options,
      storeUrl: normalizeOverwolfStoreUrl(options.storeUrl),
    };
    if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65_535) {
      throw new Error('Overwolf bridge port must be between 0 and 65535');
    }
    this.state = {
      phase: 'stopped',
      configured: Boolean(this.options.storeUrl),
      protocolVersion: OVERWOLF_BRIDGE_PROTOCOL_VERSION,
      port: null,
      connectedAt: null,
      lastMessageAt: null,
      lastError: null,
      companionVersion: null,
      gameDetected: false,
      draftActive: false,
    };
  }

  getState(): OverwolfBridgeState {
    return structuredClone(this.state);
  }

  onSnapshot(listener: (snapshot: OverwolfSnapshotMessage) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  onState(listener: (state: OverwolfBridgeState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  start(): Promise<OverwolfBridgeState> {
    if (this.server) return Promise.resolve(this.getState());
    this.startPromise ??= this.runStart().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async connect(): Promise<OverwolfBridgeState> {
    await this.start();
    if (this.state.phase === 'connected' || this.state.phase === 'pairing') {
      return this.getState();
    }
    if (!this.token || !this.state.port) {
      throw new DesktopError('OVERWOLF_BRIDGE_UNAVAILABLE', 'Overwolf bridge is unavailable');
    }
    const launchUrl = new URL(`${OVERWOLF_PAIRING_SCHEME}://connect`);
    launchUrl.searchParams.set('port', String(this.state.port));
    launchUrl.searchParams.set('protocol', String(OVERWOLF_BRIDGE_PROTOCOL_VERSION));
    launchUrl.searchParams.set('token', this.token);
    this.setState({ phase: 'pairing', lastError: null });
    this.options.logger.info('Opening the Overwolf companion through its registered protocol', {
      port: this.state.port,
      protocolVersion: OVERWOLF_BRIDGE_PROTOCOL_VERSION,
    });
    try {
      await this.options.openExternal(launchUrl.toString());
      this.startPairingTimer();
    } catch (error) {
      this.clearPairingTimer();
      this.options.logger.warn('Could not open the Overwolf companion protocol', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      this.setState({
        phase: 'listening',
        lastError: 'Overwolf Live не запущен. Установите companion и повторите подключение.',
      });
      throw new DesktopError(
        'OVERWOLF_COMPANION_NOT_FOUND',
        'Overwolf Live не установлен или недоступен',
      );
    }
    return this.getState();
  }

  async openInstaller(): Promise<void> {
    if (!this.options.storeUrl) {
      throw new DesktopError(
        'OVERWOLF_RELEASE_UNCONFIGURED',
        'Публичная ссылка Overwolf появится после одобрения приложения и выпуска в Appstore',
      );
    }
    await this.options.openExternal(this.options.storeUrl);
  }

  async dispose(): Promise<void> {
    this.disposing = true;
    this.clearStaleTimer();
    this.clearPairingTimer();
    this.token = null;
    this.lastSnapshotFingerprint = null;
    if (this.activeSocket) {
      closeSocket(this.activeSocket, 1001, 'Counterpick is shutting down');
      this.activeSocket = null;
    }
    const server = this.server;
    this.server = null;
    if (server) {
      for (const client of server.clients) client.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    this.setState({
      phase: 'stopped',
      port: null,
      connectedAt: null,
      lastMessageAt: null,
      lastError: null,
      companionVersion: null,
      gameDetected: false,
      draftActive: false,
    });
  }

  private async runStart(): Promise<OverwolfBridgeState> {
    this.disposing = false;
    this.token = randomBytes(32).toString('hex');
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: this.options.port,
      maxPayload: 64 * 1024,
      perMessageDeflate: false,
      clientTracking: true,
    });
    this.server = server;
    server.on('connection', (socket, request) => this.handleConnection(
      socket,
      request.socket.remoteAddress,
      request.url,
    ));
    server.on('error', (error) => {
      if (this.server !== server || this.disposing) return;
      this.options.logger.error('Overwolf bridge server error', errorSummary(error));
      this.setState({
        phase: 'error',
        lastError: error instanceof Error ? error.message : 'Не удалось запустить локальный bridge',
      });
    });
    await new Promise<void>((resolve, reject) => {
      const handleListening = () => {
        server.removeListener('error', handleStartupError);
        resolve();
      };
      const handleStartupError = (error: Error) => {
        server.removeListener('listening', handleListening);
        reject(error);
      };
      server.once('listening', handleListening);
      server.once('error', handleStartupError);
    }).catch((error) => {
      if (this.server === server) this.server = null;
      this.setState({
        phase: 'error',
        lastError: error instanceof Error ? error.message : 'Не удалось запустить локальный bridge',
      });
      throw new DesktopError(
        'OVERWOLF_BRIDGE_START_FAILED',
        'Не удалось запустить локальный Overwolf bridge',
        null,
        error,
      );
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new DesktopError('OVERWOLF_BRIDGE_START_FAILED', 'Не удалось определить порт bridge');
    }
    this.setState({ phase: 'listening', port: address.port, lastError: null });
    this.options.logger.info('Overwolf bridge is listening on loopback', { port: address.port });
    this.startStaleTimer();
    return this.getState();
  }

  private handleConnection(
    socket: WebSocket,
    remoteAddress: string | undefined,
    requestPath: string | undefined,
  ): void {
    if (!isLoopbackAddress(remoteAddress) || requestPath !== '/v1/live') {
      this.options.logger.warn('Rejected an unsupported Overwolf bridge connection');
      closeSocket(socket, 1008, 'Unsupported bridge endpoint');
      return;
    }
    let authenticated = false;
    const helloTimer = setTimeout(() => {
      if (!authenticated) closeSocket(socket, 1008, 'Authentication timeout');
    }, helloTimeoutMs);

    socket.on('message', (raw, isBinary) => {
      if (isBinary) {
        closeSocket(socket, 1003, 'Text messages only');
        return;
      }
      const message = this.parseMessage(raw);
      if (!message) {
        closeSocket(socket, 1007, 'Invalid bridge message');
        return;
      }
      if (!authenticated) {
        if (message.type !== 'hello' || !this.matchesToken(message.sessionToken)) {
          this.options.logger.warn('Rejected an unauthenticated Overwolf bridge client');
          closeSocket(socket, 1008, 'Authentication failed');
          return;
        }
        if (Math.abs(Date.now() - message.sentAt) > maxClockSkewMs) {
          closeSocket(socket, 1008, 'Pairing request expired');
          return;
        }
        authenticated = true;
        clearTimeout(helloTimer);
        this.clearPairingTimer();
        if (this.activeSocket && this.activeSocket !== socket) {
          closeSocket(this.activeSocket, 4001, 'Replaced by a newer companion connection');
        }
        this.activeSocket = socket;
        this.lastSequence = -1;
        this.lastSnapshotFingerprint = null;
        const now = new Date().toISOString();
        this.setState({
          phase: 'connected',
          connectedAt: now,
          lastMessageAt: now,
          lastError: null,
          companionVersion: message.companionVersion,
        });
        this.options.logger.info('Authenticated Overwolf companion connected');
        this.send(socket, {
          version: OVERWOLF_BRIDGE_PROTOCOL_VERSION,
          type: 'hello-ack',
          serverTime: Date.now(),
          heartbeatIntervalMs,
        });
        return;
      }
      if (socket !== this.activeSocket || message.type === 'hello') return;
      if ('sequence' in message && message.sequence <= this.lastSequence) return;
      if ('sequence' in message) this.lastSequence = message.sequence;
      const lastMessageAt = new Date().toISOString();
      if (message.type === 'heartbeat') {
        this.setState({ phase: 'connected', lastMessageAt, lastError: null });
        return;
      }
      if (message.type === 'diagnostic') {
        this.options.logger[message.level]('Overwolf companion diagnostic', { code: message.code });
        this.setState({ phase: 'connected', lastMessageAt, lastError: null });
        return;
      }
      const fingerprint = overwolfSnapshotFingerprint(message);
      const isDuplicate = fingerprint === this.lastSnapshotFingerprint;
      this.lastSnapshotFingerprint = fingerprint;
      const statePatch = {
        phase: 'connected',
        lastMessageAt,
        lastError: null,
        gameDetected: message.game.running,
        draftActive: message.game.running && isDraftMatchState(message.game.matchState),
      } as const;
      const shouldPublishState = this.state.phase !== 'connected'
        || this.state.lastError !== null
        || this.state.gameDetected !== statePatch.gameDetected
        || this.state.draftActive !== statePatch.draftActive;
      if (shouldPublishState) this.setState(statePatch);
      else this.state = { ...this.state, ...statePatch };
      if (isDuplicate) return;
      for (const listener of this.snapshotListeners) {
        try {
          listener(structuredClone(message));
        } catch (error) {
          this.options.logger.error('Overwolf snapshot listener failed', errorSummary(error));
        }
      }
    });

    socket.on('error', (error) => {
      if (socket === this.activeSocket) {
        this.options.logger.warn('Overwolf companion socket error', errorSummary(error));
      }
    });
    socket.on('close', (code) => {
      clearTimeout(helloTimer);
      if (socket !== this.activeSocket) return;
      this.activeSocket = null;
      this.lastSequence = -1;
      this.lastSnapshotFingerprint = null;
      this.options.logger.info('Overwolf companion disconnected', { code });
      if (!this.disposing) {
        this.setState({
          phase: 'listening',
          connectedAt: null,
          companionVersion: null,
          gameDetected: false,
          draftActive: false,
        });
      }
    });
  }

  private parseMessage(raw: RawData) {
    try {
      const parsedJson = JSON.parse(raw.toString('utf8')) as unknown;
      const parsed = overwolfClientMessageSchema.safeParse(parsedJson);
      if (!parsed.success) {
        this.options.logger.warn('Rejected an invalid Overwolf bridge message', {
          issues: parsed.error.issues.map((issue) => issue.path.join('.')).slice(0, 6),
        });
        return null;
      }
      return parsed.data;
    } catch {
      this.options.logger.warn('Rejected malformed JSON from the Overwolf bridge');
      return null;
    }
  }

  private matchesToken(candidate: string): boolean {
    if (!this.token || candidate.length !== this.token.length) return false;
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(this.token));
  }

  private send(socket: WebSocket, message: OverwolfServerMessage): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  private startStaleTimer(): void {
    this.clearStaleTimer();
    this.staleTimer = setInterval(() => {
      const socket = this.activeSocket;
      if (!socket || !this.state.lastMessageAt) return;
      const age = Date.now() - new Date(this.state.lastMessageAt).getTime();
      if (age >= terminateAfterMs) {
        this.options.logger.warn('Terminating an unresponsive Overwolf companion connection', { age });
        socket.terminate();
        return;
      }
      if (age >= staleAfterMs && this.state.phase === 'connected') {
        this.setState({
          phase: 'stale',
          lastError: 'Overwolf Live перестал присылать heartbeat. Переподключаемся.',
        });
      }
    }, heartbeatIntervalMs);
  }

  private clearStaleTimer(): void {
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.staleTimer = null;
  }

  private startPairingTimer(): void {
    this.clearPairingTimer();
    if (this.state.phase !== 'pairing') return;
    const timeoutMs = Math.max(1, this.options.pairingTimeoutMs ?? defaultPairingTimeoutMs);
    this.pairingTimer = setTimeout(() => {
      this.pairingTimer = null;
      if (this.state.phase !== 'pairing') return;
      this.options.logger.warn('Overwolf companion pairing timed out', { timeoutMs });
      this.setState({
        phase: 'listening',
        lastError: 'Overwolf Live не подключился. Проверьте companion и повторите попытку.',
      });
    }, timeoutMs);
    this.pairingTimer.unref();
  }

  private clearPairingTimer(): void {
    if (this.pairingTimer) clearTimeout(this.pairingTimer);
    this.pairingTimer = null;
  }

  private setState(patch: Partial<OverwolfBridgeState>): void {
    const next = { ...this.state, ...patch };
    if (isDeepStrictEqual(next, this.state)) return;
    this.state = next;
    try {
      this.options.onState(this.getState());
    } catch (error) {
      this.options.logger.error('Overwolf state publisher failed', errorSummary(error));
    }
    for (const listener of this.stateListeners) {
      try {
        listener(this.getState());
      } catch (error) {
        this.options.logger.error('Overwolf state listener failed', errorSummary(error));
      }
    }
  }
}

export function isDraftMatchState(matchState: string | null): boolean {
  return Boolean(
    matchState
    && (matchState.includes('HERO_SELECTION') || matchState.includes('STRATEGY_TIME')),
  );
}
