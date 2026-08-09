import { createHash, randomUUID } from 'node:crypto';
import type {
  EngineState,
  Hero,
  Position,
  Rank,
} from '../shared/contracts.js';
import type { ApiClient } from './api-client.js';
import { isRetryableAnalysisError } from './analysis-errors.js';
import { DesktopError } from './errors.js';
import type { OverwolfBridge } from './overwolf-bridge.js';
import { isDraftMatchState } from './overwolf-bridge.js';
import type { OverwolfSnapshotMessage } from './overwolf-protocol.js';
import type { PreferencesStore } from './preferences-store.js';
import { safeDiagnosticErrorCode, type DiagnosticEventDraft } from './diagnostics.js';

type EngineLogger = {
  info: (message: string, ...details: unknown[]) => void;
  warn: (message: string, ...details: unknown[]) => void;
  error: (message: string, ...details: unknown[]) => void;
};

type ExactDraft = {
  position: Position;
  rank: Rank | null;
  allyHeroIds: number[];
  enemyHeroIds: number[];
  bannedHeroIds: number[];
};

const analysisDebounceMs = 450;

function unique(values: number[], limit: number): number[] {
  return [...new Set(values)].slice(0, limit);
}

function normalizeHeroName(value: string | null): string | null {
  return value?.trim().toLowerCase().replace(/^npc_dota_hero_/, '') || null;
}

export function normalizeOverwolfDraft(
  snapshot: OverwolfSnapshotMessage,
  fallbackPosition: Position,
  rank: Rank | null,
  autoDetectPosition: boolean,
  heroIdsByName: ReadonlyMap<string, number> = new Map(),
): ExactDraft | null {
  const playerTeam = snapshot.game.playerTeam;
  if (!playerTeam) return null;
  const localHeroName = normalizeHeroName(snapshot.game.localHeroName);
  const confirmedPicks = snapshot.draft.picks.filter((pick) => pick.confirmed);
  const confirmedAllies = confirmedPicks.filter((pick) => pick.team === playerTeam);
  const confirmedEnemies = confirmedPicks.filter((pick) => pick.team !== playerTeam);
  const heroIds = confirmedPicks.map((pick) => pick.heroId);
  const occupiedSlots = confirmedPicks
    .filter((pick) => pick.slot !== null)
    .map((pick) => `${pick.team}:${pick.slot}`);
  if (
    new Set(heroIds).size !== heroIds.length
    || new Set(occupiedSlots).size !== occupiedSlots.length
    || confirmedAllies.length > 5
    || confirmedEnemies.length > 5
  ) return null;
  const resolvedLocalHeroId = snapshot.game.localHeroId
    ?? (localHeroName ? heroIdsByName.get(localHeroName) ?? null : null);
  const pickedHeroIds = new Set(confirmedPicks.map((pick) => pick.heroId));
  const isLocalPick = (pick: OverwolfSnapshotMessage['draft']['picks'][number]) => (
    pick.team === playerTeam
    && (
      pick.heroId === resolvedLocalHeroId
      || (
        localHeroName !== null
        && normalizeHeroName(pick.heroName) === localHeroName
      )
      || (
        snapshot.game.localSlot !== null
        && pick.slot !== null
        && pick.slot === snapshot.game.localSlot
      )
    )
  );
  const localPickCount = confirmedAllies.filter(isLocalPick).length;
  const hasLocalIdentity = resolvedLocalHeroId !== null
    || localHeroName !== null
    || snapshot.game.localSlot !== null;
  if (
    (hasLocalIdentity && localPickCount !== 1)
    || (confirmedAllies.length === 5 && localPickCount !== 1)
  ) return null;
  const allyHeroIds = confirmedAllies.filter((pick) => !isLocalPick(pick)).map((pick) => pick.heroId);
  const enemyHeroIds = confirmedEnemies.map((pick) => pick.heroId);
  if (allyHeroIds.length > 4) return null;
  const bannedHeroIds = unique(
    snapshot.draft.bans.filter((heroId) => !pickedHeroIds.has(heroId)),
    20,
  );
  return {
    position: autoDetectPosition
      ? snapshot.game.localPosition ?? fallbackPosition
      : fallbackPosition,
    rank,
    allyHeroIds,
    enemyHeroIds,
    bannedHeroIds,
  };
}

function draftKey(draft: ExactDraft): string {
  return JSON.stringify({
    position: draft.position,
    rank: draft.rank,
    allies: [...draft.allyHeroIds].sort((left, right) => left - right),
    enemies: [...draft.enemyHeroIds].sort((left, right) => left - right),
    bans: [...draft.bannedHeroIds].sort((left, right) => left - right),
  });
}

export class OverwolfDraftEngine {
  private readonly api: ApiClient;
  private readonly preferences: PreferencesStore;
  private readonly bridge: OverwolfBridge;
  private readonly emit: (state: EngineState) => void;
  private readonly logger: EngineLogger;
  private readonly diagnostic?: (event: DiagnosticEventDraft) => void;
  private state: EngineState = {
    enabled: false,
    phase: 'off',
    message: null,
    latestAnalysisId: null,
    latestAnalysis: null,
    lastSeenAt: null,
    dotaDetected: false,
    draftActive: false,
    refreshPending: false,
    recognition: null,
  };
  private latestSnapshot: OverwolfSnapshotMessage | null = null;
  private analysisTimer: NodeJS.Timeout | null = null;
  private transitionQueue: Promise<void> = Promise.resolve();
  private generation = 0;
  private busy = false;
  private forcePending = false;
  private retryPending = false;
  private lastCompletedDraftKey: string | null = null;
  private requestDraftKey: string | null = null;
  private requestIdempotencyKey: string | null = null;
  private requestGeneration: number | null = null;
  private queuedDraftKey: string | null = null;
  private activeDraftScope: string | null = null;
  private reservedDraftScope: string | null = null;
  private liveAnalysisId: string | null = null;
  private liveSessionToken: string | null = null;
  private autoDetectPosition = true;
  private heroes = new Map<number, Hero>();
  private heroIdsByName = new Map<string, number>();
  private heroesPromise: Promise<void> | null = null;
  private readonly unsubscribeSnapshot: () => void;
  private readonly unsubscribeBridgeState: () => void;
  private diagnosticRevision = 0;
  private diagnosticAttempt = 0;
  private lastRecognitionDiagnosticKey: string | null = null;

  constructor(
    api: ApiClient,
    preferences: PreferencesStore,
    bridge: OverwolfBridge,
    emit: (state: EngineState) => void,
    logger: EngineLogger,
    diagnostic?: (event: DiagnosticEventDraft) => void,
  ) {
    this.api = api;
    this.preferences = preferences;
    this.bridge = bridge;
    this.emit = emit;
    this.logger = logger;
    this.diagnostic = diagnostic;
    this.unsubscribeSnapshot = bridge.onSnapshot((snapshot) => this.handleSnapshot(snapshot));
    this.unsubscribeBridgeState = bridge.onState(() => this.handleBridgeState());
  }

  getState(): EngineState {
    return structuredClone(this.state);
  }

  async restore(): Promise<void> {
    await this.enqueueTransition(async () => {
      const preferences = await this.preferences.get();
      if (preferences.assistantEnabled && preferences.overwolfConsent.accepted) {
        await this.enable();
      }
    });
  }

  async setEnabled(enabled: boolean): Promise<EngineState> {
    return this.enqueueTransition(async () => {
      if (enabled) await this.enable();
      else await this.disable();
      return this.getState();
    });
  }

  async suspend(
    reason: 'assistant_disabled' | 'mode_changed' = 'assistant_disabled',
  ): Promise<EngineState> {
    return this.enqueueTransition(async () => {
      await this.disable(false, reason);
      return this.getState();
    });
  }

  async retry(): Promise<EngineState> {
    if (!this.state.enabled) return this.setEnabled(true);
    if (
      this.retryPending
      && this.requestDraftKey
      && this.requestIdempotencyKey
      && this.latestSnapshot
      && isDraftMatchState(this.latestSnapshot.game.matchState)
    ) {
      this.scheduleAnalysis(true);
      return this.getState();
    }
    await this.bridge.start();
    if (!['connected', 'pairing'].includes(this.bridge.getState().phase)) {
      await this.bridge.connect();
    }
    this.handleBridgeState();
    return this.getState();
  }

  async refresh(force = false): Promise<EngineState> {
    if (!this.state.enabled || !this.latestSnapshot) return this.getState();
    this.scheduleAnalysis(force);
    return this.getState();
  }

  useManualPositionForCurrentDraft(): void {
    if (!this.state.draftActive || !this.autoDetectPosition) return;
    this.autoDetectPosition = false;
    if (!this.state.recognition?.detectedPosition) return;
    this.update({
      ...this.state,
      recognition: { ...this.state.recognition, detectedPosition: null },
    });
  }

  async dispose(): Promise<void> {
    this.unsubscribeSnapshot();
    this.unsubscribeBridgeState();
    await this.enqueueTransition(() => this.disable(false));
  }

  private async enable(): Promise<void> {
    if (this.state.enabled && this.state.phase !== 'error') return;
    const preferences = await this.preferences.get();
    if (!preferences.overwolfConsent.accepted) {
      throw new DesktopError(
        'OVERWOLF_CONSENT_REQUIRED',
        'Сначала подтвердите подключение локального Overwolf Live companion',
      );
    }
    this.generation += 1;
    this.autoDetectPosition = true;
    await this.preferences.setAssistantEnabled(true);
    this.update({
      enabled: true,
      phase: 'starting',
      message: 'Запускаем защищённый локальный Overwolf bridge',
      latestAnalysisId: this.state.latestAnalysisId,
      latestAnalysis: this.state.latestAnalysis,
      lastSeenAt: this.state.lastSeenAt,
      dotaDetected: false,
      draftActive: false,
      refreshPending: false,
      recognition: null,
    });
    void this.loadHeroes();
    try {
      await this.bridge.start();
      if (!['connected', 'pairing'].includes(this.bridge.getState().phase)) {
        await this.bridge.connect().catch((error) => {
          this.reportDiagnostic({
            type: 'engine_error',
            status: 'error',
            stage: 'engine',
            durationMs: null,
            details: {
              code: safeDiagnosticErrorCode(error, 'OVERWOLF_CONNECT_FAILED'),
              recoverable: true,
              stage: 'engine',
            },
          });
          this.logger.warn('Overwolf companion launch was not completed', {
            code: error instanceof DesktopError ? error.code : 'UNKNOWN',
          });
        });
      }
      this.handleBridgeState();
      if (this.latestSnapshot) this.handleSnapshot(this.latestSnapshot);
    } catch (error) {
      this.reportDiagnostic({
        type: 'engine_error',
        status: 'error',
        stage: 'engine',
        durationMs: null,
        details: {
          code: safeDiagnosticErrorCode(error, 'OVERWOLF_START_FAILED'),
          recoverable: true,
          stage: 'engine',
        },
      });
      this.update({
        ...this.state,
        phase: 'error',
        message: error instanceof Error ? error.message : 'Не удалось запустить Overwolf bridge',
      });
    }
  }

  private async disable(
    persist = true,
    reason: 'assistant_disabled' | 'mode_changed' = 'assistant_disabled',
  ): Promise<void> {
    this.endDraftSession(reason);
    this.latestSnapshot = null;
    this.update({
      enabled: false,
      phase: 'off',
      message: null,
      latestAnalysisId: null,
      latestAnalysis: null,
      lastSeenAt: this.bridge.getState().lastMessageAt,
      dotaDetected: false,
      draftActive: false,
      refreshPending: false,
      recognition: null,
    });
    if (persist) await this.preferences.setAssistantEnabled(false);
    await this.bridge.dispose();
  }

  private handleBridgeState(): void {
    if (!this.state.enabled) return;
    const bridgeState = this.bridge.getState();
    if (bridgeState.phase === 'connected' && this.latestSnapshot) return;
    if (bridgeState.phase !== 'connected') {
      if (this.activeDraftScope?.startsWith('match:')) {
        this.suspendDraftForReconnect();
      } else {
        this.endDraftSession();
        this.latestSnapshot = null;
      }
    }
    const phase = bridgeState.phase === 'error' ? 'error' : 'waiting_for_dota';
    const message = bridgeState.phase === 'connected'
      ? 'Overwolf Live подключён. Ждём запуска Dota 2'
      : bridgeState.phase === 'pairing'
        ? 'Ожидаем подтверждение Overwolf Live'
        : bridgeState.phase === 'stale'
          ? 'Связь с Overwolf Live прервана. Companion переподключается'
          : bridgeState.phase === 'error'
            ? bridgeState.lastError ?? 'Локальный Overwolf bridge недоступен'
            : 'Подключите Overwolf Live одним нажатием';
    this.update({
      ...this.state,
      phase,
      message,
      lastSeenAt: bridgeState.lastMessageAt,
      dotaDetected: bridgeState.gameDetected,
      draftActive: false,
      refreshPending: false,
      latestAnalysisId: null,
      latestAnalysis: null,
      recognition: null,
    });
  }

  private handleSnapshot(snapshot: OverwolfSnapshotMessage): void {
    if (!this.state.enabled) return;
    this.latestSnapshot = structuredClone(snapshot);
    const inDraft = snapshot.game.running && isDraftMatchState(snapshot.game.matchState);
    const draftEndReason = new Set(snapshot.draft.picks.flatMap((pick) => (
      pick.confirmed && pick.heroId ? [pick.heroId] : []
    ))).size >= 10
      ? 'completed' as const
      : 'left_draft' as const;
    const bridgeState = this.bridge.getState();
    if (!snapshot.game.running) {
      this.endDraftSession(draftEndReason);
      this.update({
        ...this.state,
        phase: 'waiting_for_dota',
        message: 'Overwolf Live подключён. Ждём запуска Dota 2',
        lastSeenAt: bridgeState.lastMessageAt,
        dotaDetected: false,
        draftActive: false,
        latestAnalysisId: null,
        latestAnalysis: null,
        refreshPending: false,
        recognition: null,
      });
      return;
    }
    if (!inDraft) {
      this.endDraftSession(draftEndReason);
      this.update({
        ...this.state,
        phase: 'waiting_for_dota',
        message: 'Dota 2 запущена. Ждём этап выбора героев',
        lastSeenAt: bridgeState.lastMessageAt,
        dotaDetected: true,
        draftActive: false,
        latestAnalysisId: null,
        latestAnalysis: null,
        refreshPending: false,
        recognition: null,
      });
      return;
    }
    if (this.synchronizeDraftScope(snapshot)) {
      this.update({
        ...this.state,
        latestAnalysisId: null,
        latestAnalysis: null,
        refreshPending: false,
        recognition: null,
      });
    }
    void this.acceptDraftSnapshot(snapshot);
  }

  private async acceptDraftSnapshot(snapshot: OverwolfSnapshotMessage): Promise<void> {
    const generation = this.generation;
    const [currentPreferences] = await Promise.all([
      this.preferences.get(),
      this.loadHeroes(),
    ]);
    if (
      generation !== this.generation
      || !this.state.enabled
      || snapshot.sequence !== this.latestSnapshot?.sequence
    ) return;
    const draft = normalizeOverwolfDraft(
      snapshot,
      currentPreferences.position,
      currentPreferences.rank,
      this.autoDetectPosition,
      this.heroIdsByName,
    );
    const recognition = draft ? this.createRecognition(snapshot, draft) : null;
    const enemyCount = draft?.enemyHeroIds.length ?? 0;
    const currentDraftKey = draft ? draftKey(draft) : null;
    const recognitionRevision = draft
      && enemyCount >= 2
      && currentDraftKey !== this.requestDraftKey
      && currentDraftKey !== this.lastCompletedDraftKey
      ? Math.min(10_000, this.diagnosticRevision + 1)
      : Math.min(10_000, this.diagnosticRevision);
    if (recognition && currentDraftKey !== this.lastRecognitionDiagnosticKey) {
      this.lastRecognitionDiagnosticKey = currentDraftKey;
      this.reportDiagnostic({
        type: 'recognition_result',
        status: 'success',
        stage: 'recognition',
        durationMs: null,
        details: {
          revision: recognitionRevision,
          quality: recognition.quality,
          model: 'overwolf-live',
          recognizedCount: recognition.recognized.length,
          needsReviewCount: 0,
          slots: recognition.recognized.map((pick) => ({
            slot: pick.slot,
            side: pick.side,
            visualGroup: null,
            heroId: pick.heroId,
            confidence: pick.confidence,
            needsReview: pick.needsReview,
          })),
        },
      });
    }
    const hasCurrentResult = Boolean(
      currentDraftKey
      && currentDraftKey === this.lastCompletedDraftKey
      && this.state.latestAnalysis,
    );
    const message = !draft
      ? 'Определяем вашу сторону в матче'
      : enemyCount === 0
        ? 'Ждём первый пик соперника'
        : enemyCount < 2
          ? 'Ждём минимум два пика соперника'
          : 'Получили точный драфт из Overwolf Live';
    this.update({
      ...this.state,
      phase: this.busy ? this.state.phase : hasCurrentResult ? 'ready' : 'watching_draft',
      message: this.busy || hasCurrentResult ? this.state.message : message,
      lastSeenAt: this.bridge.getState().lastMessageAt,
      dotaDetected: true,
      draftActive: true,
      recognition,
    });
    if (draft && enemyCount >= 2) this.scheduleAnalysis(false, draftKey(draft));
  }

  private scheduleAnalysis(force: boolean, pendingDraftKey: string | null = null): void {
    if (!this.state.enabled || !this.latestSnapshot) return;
    this.forcePending ||= force;
    if (this.busy) {
      if (
        pendingDraftKey
        && (
          pendingDraftKey !== this.requestDraftKey
          || this.requestGeneration !== this.generation
        )
      ) {
        this.queuedDraftKey = pendingDraftKey;
      }
      if (this.forcePending || this.queuedDraftKey) {
        this.update({ ...this.state, refreshPending: true });
      }
      return;
    }
    if (!force && pendingDraftKey && pendingDraftKey === this.lastCompletedDraftKey) {
      this.queuedDraftKey = null;
      if (this.state.latestAnalysis) {
        this.update({
          ...this.state,
          phase: 'ready',
          message: 'Контрпики готовы',
          refreshPending: false,
        });
      }
      return;
    }
    if (pendingDraftKey) this.queuedDraftKey = pendingDraftKey;
    this.clearAnalysisTimer();
    this.analysisTimer = setTimeout(() => {
      this.analysisTimer = null;
      void this.analyzeLatest();
    }, analysisDebounceMs);
  }

  private async analyzeLatest(): Promise<void> {
    const snapshot = this.latestSnapshot;
    if (!this.state.enabled || !snapshot || this.busy) return;
    const generation = this.generation;
    const [currentPreferences] = await Promise.all([
      this.preferences.get(),
      this.loadHeroes(),
    ]);
    if (generation !== this.generation || snapshot.sequence !== this.latestSnapshot?.sequence) return;
    const draft = normalizeOverwolfDraft(
      snapshot,
      currentPreferences.position,
      currentPreferences.rank,
      this.autoDetectPosition,
      this.heroIdsByName,
    );
    if (!draft || draft.enemyHeroIds.length < 2) {
      this.queuedDraftKey = null;
      this.forcePending = false;
      return;
    }
    const nextDraftKey = draftKey(draft);
    const draftScope = this.activeDraftScope;
    if (!draftScope) return;
    const forced = this.forcePending;
    this.forcePending = false;
    if (this.queuedDraftKey === nextDraftKey) this.queuedDraftKey = null;
    if (!forced && nextDraftKey === this.lastCompletedDraftKey) {
      if (this.state.latestAnalysis) {
        this.update({
          ...this.state,
          phase: 'ready',
          message: 'Контрпики готовы',
          refreshPending: false,
          recognition: this.createRecognition(snapshot, draft),
        });
      }
      return;
    }
    const retrying = this.retryPending && this.requestDraftKey === nextDraftKey;
    this.retryPending = false;
    if (!retrying) {
      this.requestDraftKey = nextDraftKey;
      this.requestIdempotencyKey = randomUUID();
      this.diagnosticRevision += 1;
      this.diagnosticAttempt = 1;
    } else {
      this.diagnosticAttempt = Math.min(20, this.diagnosticAttempt + 1);
    }
    if (!this.requestIdempotencyKey) this.requestIdempotencyKey = randomUUID();
    this.busy = true;
    this.requestGeneration = generation;
    this.update({
      ...this.state,
      phase: 'analyzing',
      message: 'Считаем контрпики по точным данным Overwolf Live',
      latestAnalysisId: this.state.latestAnalysisId,
      latestAnalysis: this.state.latestAnalysis,
      refreshPending: false,
      recognition: this.createRecognition(snapshot, draft),
    });
    this.logger.info('Starting an Overwolf Live analysis', {
      matchScoped: Boolean(snapshot.game.pseudoMatchId),
      allies: draft.allyHeroIds.length,
      enemies: draft.enemyHeroIds.length,
      bans: draft.bannedHeroIds.length,
      position: draft.position,
      rank: draft.rank,
    });
    const analysisId = this.isActiveDraftScopeReserved()
      ? this.liveAnalysisId
      : null;
    const requestStartedAt = performance.now();
    this.reportDiagnostic({
      type: 'request_started',
      status: 'info',
      stage: 'request',
      durationMs: null,
      details: {
        revision: this.diagnosticRevision,
        operation: analysisId ? 'revise' : 'create',
        attempt: this.diagnosticAttempt,
      },
    });
    try {
      const response = analysisId
        ? await this.api.reviseOverwolf(
            analysisId,
            draft,
            this.requestIdempotencyKey,
            this.liveSessionToken as string,
          )
        : await this.api.analyzeOverwolf(draft, this.requestIdempotencyKey);
      if (
        generation !== this.generation
        || !this.state.enabled
        || this.activeDraftScope !== draftScope
      ) return;
      if (!analysisId) {
        this.liveAnalysisId = response.analysis.id;
        this.reservedDraftScope = draftScope;
      }
      this.liveSessionToken = response.liveSession.token;
      const latestSnapshot = this.latestSnapshot;
      const latestDraft = latestSnapshot && isDraftMatchState(latestSnapshot.game.matchState)
        ? normalizeOverwolfDraft(
          latestSnapshot,
          currentPreferences.position,
          currentPreferences.rank,
          this.autoDetectPosition,
          this.heroIdsByName,
        )
        : null;
      const latestDraftKey = latestDraft ? draftKey(latestDraft) : null;
      const resultApplies = Boolean(
        this.state.enabled
        && generation === this.generation
        && this.bridge.getState().phase === 'connected'
        && this.activeDraftScope === draftScope
        && latestDraftKey === nextDraftKey,
      );
      if (this.queuedDraftKey === nextDraftKey) this.queuedDraftKey = null;
      if (resultApplies) this.lastCompletedDraftKey = nextDraftKey;
      this.requestDraftKey = null;
      this.requestIdempotencyKey = null;
      this.requestGeneration = null;
      this.retryPending = false;
      if (this.state.enabled && this.activeDraftScope === draftScope && latestSnapshot) {
        this.update({
          ...this.state,
          phase: resultApplies ? 'ready' : 'watching_draft',
          message: resultApplies ? 'Контрпики готовы · обновлены по текущему драфту' : this.state.message,
          latestAnalysisId: resultApplies ? response.analysis.id : this.state.latestAnalysisId,
          latestAnalysis: resultApplies ? response.analysis : this.state.latestAnalysis,
          refreshPending: Boolean(this.queuedDraftKey),
          recognition: latestSnapshot && latestDraft
            ? this.createRecognition(latestSnapshot, latestDraft)
            : this.state.recognition,
        });
      }
      this.logger.info('Overwolf Live analysis completed', {
        analysisId: response.analysis.id,
        revision: Boolean(analysisId),
        remainingQuota: response.quota.remaining,
      });
      const latencyMs = Math.min(120_000, Math.round(performance.now() - requestStartedAt));
      this.reportDiagnostic({
        type: 'request_completed',
        status: resultApplies ? 'success' : 'warning',
        stage: 'request',
        durationMs: latencyMs,
        details: {
          revision: this.diagnosticRevision,
          outcome: resultApplies ? 'completed' : 'stale',
          latencyMs,
          analysisId: response.analysis.id,
          recommendationHeroIds: response.analysis.result?.recommendations
            .slice(0, 3)
            .map((recommendation) => recommendation.hero.id) ?? [],
        },
      });
    } catch (error) {
      if (
        generation !== this.generation
        || !this.state.enabled
        || this.activeDraftScope !== draftScope
      ) return;
      const liveSessionInvalid = analysisId !== null
        && error instanceof DesktopError
        && error.code === 'OVERWOLF_LIVE_SESSION_INVALID'
        && error.status === 401;
      const isQuota = error instanceof DesktopError
        && (error.code === 'QUOTA_EXHAUSTED' || error.status === 402);
      const retryable = liveSessionInvalid || isRetryableAnalysisError(error);
      const latencyMs = Math.min(120_000, Math.round(performance.now() - requestStartedAt));
      this.reportDiagnostic({
        type: 'request_completed',
        status: 'error',
        stage: 'request',
        durationMs: latencyMs,
        details: {
          revision: this.diagnosticRevision,
          outcome: 'error',
          latencyMs,
          errorCode: safeDiagnosticErrorCode(error),
          recoverable: retryable,
        },
      });
      this.reportDiagnostic({
        type: 'engine_error',
        status: 'error',
        stage: 'engine',
        durationMs: null,
        details: {
          code: safeDiagnosticErrorCode(error),
          recoverable: retryable,
          stage: 'request',
        },
      });
      if (liveSessionInvalid) {
        this.liveAnalysisId = null;
        this.liveSessionToken = null;
        this.reservedDraftScope = null;
        this.requestDraftKey = null;
        this.requestIdempotencyKey = null;
        this.requestGeneration = null;
        this.retryPending = false;
        this.queuedDraftKey = nextDraftKey;
        this.forcePending = true;
        this.update({
          ...this.state,
          phase: 'watching_draft',
          message: 'Сессия Overwolf Live обновляется',
          refreshPending: true,
        });
        this.logger.warn('Overwolf live capability expired; starting a new scoped analysis');
        return;
      }
      if (!retryable || isQuota) {
        this.requestDraftKey = null;
        this.requestIdempotencyKey = null;
        this.requestGeneration = null;
      }
      this.retryPending = retryable && !isQuota;
      if (generation === this.generation && this.activeDraftScope === draftScope) this.update({
        ...this.state,
        phase: isQuota ? 'quota' : 'error',
        message: isQuota
          ? 'Лимит попыток исчерпан'
          : error instanceof Error
            ? error.message
            : 'Не удалось рассчитать контрпики',
      });
      this.logger.error('Overwolf Live analysis failed', {
        code: error instanceof DesktopError ? error.code : 'UNKNOWN',
        status: error instanceof DesktopError ? error.status : null,
        retryable,
      });
    } finally {
      this.busy = false;
      const latest = this.latestSnapshot;
      if (
        latest
        && this.state.enabled
        && isDraftMatchState(latest.game.matchState)
        && (this.queuedDraftKey || this.forcePending)
        && this.state.phase !== 'quota'
      ) {
        this.scheduleAnalysis(this.forcePending, this.queuedDraftKey);
      }
    }
  }

  private createRecognition(
    snapshot: OverwolfSnapshotMessage,
    draft: ExactDraft,
  ): NonNullable<EngineState['recognition']> {
    const playerTeam = snapshot.game.playerTeam;
    const groups = [
      { side: 'ally' as const, team: playerTeam, heroIds: draft.allyHeroIds },
      {
        side: 'enemy' as const,
        team: playerTeam === 2 ? 3 as const : 2 as const,
        heroIds: draft.enemyHeroIds,
      },
    ];
    return {
      quality: 'clear',
      detectedPosition: this.autoDetectPosition ? draft.position : null,
      recognized: groups.flatMap((group) => group.heroIds.map((heroId, index) => {
        const pick = snapshot.draft.picks.find((candidate) => (
          candidate.confirmed
          && candidate.team === group.team
          && candidate.heroId === heroId
        ));
        const hero = this.heroes.get(heroId);
        return {
          side: group.side,
          slot: pick?.slot ?? index,
          heroId,
          heroName: hero?.name ?? `Hero ${heroId}`,
          localizedName: hero?.localizedName ?? null,
          confidence: 1,
          needsReview: false,
        };
      })),
    };
  }

  private loadHeroes(): Promise<void> {
    if (this.heroes.size > 0) return Promise.resolve();
    this.heroesPromise ??= this.api.heroes()
      .then(({ heroes }) => {
        this.heroes = new Map(heroes.map((hero) => [hero.id, hero]));
        this.heroIdsByName = new Map(
          heroes.flatMap((hero) => {
            const name = normalizeHeroName(hero.name);
            return name ? [[name, hero.id] as const] : [];
          }),
        );
      })
      .catch((error) => {
        this.logger.warn('Could not load hero labels for Overwolf telemetry', {
          code: error instanceof DesktopError ? error.code : 'UNKNOWN',
          status: error instanceof DesktopError ? error.status : null,
        });
      })
      .finally(() => {
        this.heroesPromise = null;
      });
    return this.heroesPromise;
  }

  private update(state: EngineState): void {
    this.state = structuredClone({
      ...state,
      refreshPending: state.refreshPending
        || Boolean(this.queuedDraftKey)
        || this.forcePending
        || this.retryPending,
    });
    this.emit(this.getState());
  }

  private clearAnalysisTimer(): void {
    if (this.analysisTimer) clearTimeout(this.analysisTimer);
    this.analysisTimer = null;
  }

  private invalidateDraftSession(clearSnapshot: boolean): void {
    this.generation += 1;
    this.clearAnalysisTimer();
    this.forcePending = false;
    this.retryPending = false;
    this.lastCompletedDraftKey = null;
    if (!this.busy) {
      this.requestDraftKey = null;
      this.requestIdempotencyKey = null;
      this.requestGeneration = null;
    }
    this.queuedDraftKey = null;
    this.autoDetectPosition = true;
    this.lastRecognitionDiagnosticKey = null;
    if (clearSnapshot) this.latestSnapshot = null;
  }

  private synchronizeDraftScope(snapshot: OverwolfSnapshotMessage): boolean {
    const matchId = snapshot.game.pseudoMatchId?.trim();
    const observedScope = matchId
      ? `match:${createHash('sha256').update(matchId).digest('hex')}`
      : null;
    if (!this.activeDraftScope) {
      this.beginDraftSession(observedScope ?? `local:${randomUUID()}`);
      return true;
    }
    if (!observedScope || observedScope === this.activeDraftScope) return false;
    if (this.activeDraftScope.startsWith('local:')) {
      const reservationBelongsToDraft = this.reservedDraftScope === this.activeDraftScope;
      this.activeDraftScope = observedScope;
      if (reservationBelongsToDraft) this.reservedDraftScope = observedScope;
      return false;
    }
    this.endDraftSession('left_draft');
    this.beginDraftSession(observedScope);
    return true;
  }

  private beginDraftSession(scope: string): void {
    this.activeDraftScope = scope;
    const diagnosticDraftSessionId = randomUUID();
    this.diagnosticRevision = 0;
    this.diagnosticAttempt = 0;
    this.reportDiagnostic({
      type: 'draft_started',
      status: 'info',
      stage: 'draft',
      durationMs: null,
      details: { draftSessionId: diagnosticDraftSessionId },
    });
    this.reservedDraftScope = null;
    this.liveAnalysisId = null;
    this.liveSessionToken = null;
  }

  private suspendDraftForReconnect(): void {
    this.clearAnalysisTimer();
    this.forcePending = false;
    this.retryPending = false;
    this.lastCompletedDraftKey = null;
    this.queuedDraftKey = null;
    this.autoDetectPosition = true;
    this.latestSnapshot = null;
    if (!this.busy) {
      this.requestDraftKey = null;
      this.requestIdempotencyKey = null;
      this.requestGeneration = null;
    }
  }

  private isActiveDraftScopeReserved(): boolean {
    return Boolean(
      this.activeDraftScope
      && this.reservedDraftScope === this.activeDraftScope
      && Boolean(this.liveAnalysisId)
      && Boolean(this.liveSessionToken)
    );
  }

  private endDraftSession(
    reason: 'completed' | 'left_draft' | 'assistant_disabled' | 'mode_changed' | 'error' = 'left_draft',
  ): void {
    if (this.activeDraftScope) {
      this.reportDiagnostic({
        type: 'draft_ended',
        status: reason === 'completed' ? 'success' : reason === 'error' ? 'error' : 'info',
        stage: 'draft',
        durationMs: null,
        details: { reason },
      });
    }
    this.invalidateDraftSession(false);
    this.activeDraftScope = null;
    this.reservedDraftScope = null;
    this.liveAnalysisId = null;
    this.liveSessionToken = null;
  }

  private reportDiagnostic(event: DiagnosticEventDraft): void {
    try {
      this.diagnostic?.(event);
    } catch {
      return;
    }
  }

  private enqueueTransition<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.transitionQueue.then(operation, operation);
    this.transitionQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
