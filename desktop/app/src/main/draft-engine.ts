import { randomUUID } from 'node:crypto';
import type { NativeImage } from 'electron';
import type {
  Analysis,
  DraftAllyGroup,
  EngineState,
  Position,
  Preferences,
} from '../shared/contracts.js';
import type { ApiClient } from './api-client.js';
import { isRetryableAnalysisError } from './analysis-errors.js';
import { DesktopError } from './errors.js';
import {
  createDraftFrameFingerprint,
  draftFrameDistance,
  draftFramesMatch,
  type DraftFrameFingerprint,
} from './draft-frame-fingerprint.js';
import {
  GsiReceiver,
  resolveGsiHeroAllyGroup,
  resolveGsiHeroSignal,
  resolveGsiTeam,
  type GsiHeroSignal,
  type GsiPayload,
  type GsiTeam,
} from './gsi.js';
import type { PreferencesStore } from './preferences-store.js';
import { scopedDesktopLogger } from './local-logger.js';
import { safeDiagnosticErrorCode, type DiagnosticEventDraft } from './diagnostics.js';

const captureIntervalMs = 5_000;
const captureDebounceMs = 1_500;
const gsiFreshnessMs = 20_000;
const lastSeenPublishIntervalMs = 10_000;
const windowPollIntervalsMs = [10_000, 20_000, 30_000] as const;
const hashWatchThumbnailSize = { width: 320, height: 180 };
const uploadThumbnailSize = { width: 1600, height: 900 };
const visionLog = scopedDesktopLogger('vision');

type DraftOrientation = {
  allyGroup: DraftAllyGroup;
  source: 'gsi_player_hero' | 'manual_confirmation';
};

type DraftEngineOptions = {
  captureDotaWindow?: (thumbnailSize: { width: number; height: number }) => Promise<NativeImage | null>;
  captureIntervalMs?: number;
  captureDebounceMs?: number;
  diagnostic?: (event: DiagnosticEventDraft) => void;
};
const waitingMessages = {
  not_dota_draft: 'Не вижу экран выбора героев. Включите режим «Окно без рамки»',
  image_unclear: 'Кадр нечёткий. Откройте Dota 2 и используйте режим «Окно без рамки»',
  uncertain_picks: 'Не все герои распознаны уверенно. Ждём следующий кадр',
  insufficient_enemy_picks: 'Ждём минимум два пика соперника',
  no_enemy_picks: 'Ждём первый пик соперника',
} as const;
type WaitingReason = keyof typeof waitingMessages;
type DesktopAnalysisResponse = Awaited<ReturnType<ApiClient['analyzeDesktop']>>;

function analysisDiagnostic(response: DesktopAnalysisResponse): {
  analysisId?: string;
  recommendationHeroIds?: number[];
} {
  if (response.status !== 'completed') return {};
  return {
    analysisId: response.analysis.id,
    recommendationHeroIds: response.analysis.result?.recommendations
      .slice(0, 3)
      .map((recommendation) => recommendation.hero.id) ?? [],
  };
}

function isDraftState(gameState: string): boolean {
  return gameState.includes('HERO_SELECTION') || gameState.includes('STRATEGY_TIME');
}

function analysisMatchesPreferences(
  analysis: Analysis | null,
  preferences: Preferences,
  detectedPosition: Position | null,
): boolean {
  return Boolean(
    analysis
    && analysis.input.position === (detectedPosition ?? preferences.position)
    && (analysis.input.rank ?? null) === preferences.rank,
  );
}

function fitForUpload(image: NativeImage): NativeImage {
  const size = image.getSize();
  const scale = Math.min(1, 1600 / size.width, 900 / size.height);
  if (scale === 1) return image;
  return image.resize({
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
    quality: 'better',
  });
}

export class DraftEngine {
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
    draftOrientation: null,
    recognition: null,
  };
  private captureTimer: NodeJS.Timeout | null = null;
  private windowPollTimer: NodeJS.Timeout | null = null;
  private analyzingTimer: NodeJS.Timeout | null = null;
  private transitionQueue: Promise<void> = Promise.resolve();
  private captureGeneration = 0;
  private windowPollInFlight = false;
  private windowPollingActive = false;
  private windowPollIndex = 0;
  private lastGsiAt = 0;
  private lastSeenPublishedAt = 0;
  private inDraft = false;
  private busy = false;
  private lastFingerprint: DraftFrameFingerprint | null = null;
  private lastCaptureAt = 0;
  private revision = 0;
  private sessionId = randomUUID();
  private requestFingerprint: DraftFrameFingerprint | null = null;
  private requestKey: string | null = null;
  private requestImage: Buffer | null = null;
  private requestAllyGroup: DraftAllyGroup | null = null;
  private requestOrientationSource: 'gsi_player_hero' | 'manual_confirmation' | null = null;
  private liveAnalysisId: string | null = null;
  private liveSessionToken: string | null = null;
  private localTeam: GsiTeam | null = null;
  private localHero: GsiHeroSignal | null = null;
  private automaticAllyGroup: DraftAllyGroup | null = null;
  private manualAllyGroup: DraftAllyGroup | null = null;
  private refreshRequested = false;
  private retryRequested = false;
  private forceRefresh = false;
  private autoDetectPosition = true;
  private requestAttempt = 0;

  constructor(
    private readonly api: ApiClient,
    private readonly preferences: PreferencesStore,
    private readonly gsi: GsiReceiver,
    private readonly emit: (state: EngineState) => void,
    private readonly options: DraftEngineOptions = {},
  ) {}

  getState(): EngineState {
    return structuredClone(this.state);
  }

  async restore(): Promise<void> {
    await this.enqueueTransition(async () => {
      const preferences = await this.preferences.get();
      if (preferences.assistantEnabled && preferences.captureConsent.accepted) {
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
    if (this.state.phase === 'quota') return this.refresh(true);
    if (this.inDraft) {
      if (!this.requestKey || !this.requestImage) return this.refresh(true);
      this.retryRequested = true;
      this.update({
        ...this.state,
        phase: this.busy ? this.state.phase : 'watching_draft',
        message: 'Повторяем анализ кадра',
      });
      if (!this.busy) {
        this.cancelCapture();
        this.scheduleCapture();
      }
    }
    else if (this.state.phase === 'error') return this.setEnabled(true);
    else await this.pollDotaWindow();
    return this.getState();
  }

  async refresh(force = false): Promise<EngineState> {
    return this.enqueueTransition(async () => {
      if (!this.state.enabled || !this.inDraft) return this.getState();
      const forceNextCapture = force || this.state.phase === 'quota';
      this.refreshRequested = true;
      this.retryRequested = false;
      this.forceRefresh ||= forceNextCapture;
      this.update({
        ...this.state,
        phase: this.busy ? this.state.phase : 'watching_draft',
        message: forceNextCapture ? 'Пересчитываем рекомендации' : 'Проверяем новые пики',
      });
      if (!this.busy) this.scheduleCapture();
      return this.getState();
    });
  }

  useManualPositionForCurrentDraft(): void {
    if (!this.inDraft || !this.autoDetectPosition) return;
    this.autoDetectPosition = false;
    if (!this.state.recognition?.detectedPosition) return;
    this.update({
      ...this.state,
      recognition: {
        ...this.state.recognition,
        detectedPosition: null,
      },
    });
  }

  async setManualAllyGroupForCurrentDraft(allyGroup: DraftAllyGroup): Promise<EngineState> {
    if (!this.state.enabled || !this.inDraft) {
      throw new DesktopError('DRAFT_NOT_ACTIVE', 'Выбор стороны доступен только во время драфта');
    }
    this.manualAllyGroup = allyGroup;
    this.automaticAllyGroup = null;
    this.update({
      ...this.state,
      draftOrientation: {
        allyGroup,
        source: 'manual_confirmation',
      },
      message: 'Сторона команды подтверждена — обновляем пики',
    });
    visionLog.info('Draft orientation selected', {
      source: 'manual_confirmation',
      allyGroup,
    });
    return this.refresh(true);
  }

  async dispose(): Promise<void> {
    await this.enqueueTransition(() => this.disable(false));
  }

  private async enable(): Promise<void> {
    if (this.state.enabled && this.state.phase !== 'error') return;
    const preferences = await this.preferences.get();
    if (!preferences.captureConsent.accepted) {
      throw new DesktopError(
        'CAPTURE_CONSENT_REQUIRED',
        'Сначала подтвердите локальный захват окна Dota 2 в настройках',
      );
    }
    this.lastGsiAt = 0;
    this.lastSeenPublishedAt = 0;
    await this.preferences.setAssistantEnabled(true);
    this.update({
      enabled: true,
      phase: 'starting',
      message: 'Подключаемся к Dota 2',
      latestAnalysisId: this.state.latestAnalysisId,
      latestAnalysis: this.state.latestAnalysis,
      lastSeenAt: this.state.lastSeenAt,
      dotaDetected: false,
      draftActive: false,
      refreshPending: false,
      recognition: null,
    });
    try {
      const installation = await this.gsi.start((payload) => this.handleGsi(payload));
      this.startWindowPolling();
      this.update({
        ...this.state,
        phase: 'waiting_for_dota',
        message: installation.installed
          ? 'Запустите Dota 2 с параметром -gamestateintegration'
          : 'Dota 2 не найдена. Установите игру через Steam и перезапустите помощник',
      });
      await this.pollDotaWindow();
    } catch (error) {
      await this.gsi.stop();
      this.reportDiagnostic({
        type: 'engine_error',
        status: 'error',
        stage: 'engine',
        durationMs: null,
        details: {
          code: safeDiagnosticErrorCode(error, 'ENGINE_START_FAILED'),
          recoverable: true,
          stage: 'engine',
        },
      });
      this.update({
        ...this.state,
        enabled: true,
        phase: 'error',
        message: error instanceof Error ? error.message : 'Не удалось запустить помощник',
      });
    }
  }

  private async disable(
    persist = true,
    reason: 'assistant_disabled' | 'mode_changed' = 'assistant_disabled',
  ): Promise<void> {
    this.invalidateCapture();
    this.clearTimers();
    await this.gsi.stop();
    if (this.inDraft) this.endDraftSession(reason);
    this.inDraft = false;
    this.lastFingerprint = null;
    this.requestFingerprint = null;
    this.requestKey = null;
    this.requestImage = null;
    this.requestAllyGroup = null;
    this.requestOrientationSource = null;
    this.liveAnalysisId = null;
    this.liveSessionToken = null;
    this.localTeam = null;
    this.localHero = null;
    this.automaticAllyGroup = null;
    this.manualAllyGroup = null;
    this.refreshRequested = false;
    this.retryRequested = false;
    this.forceRefresh = false;
    this.autoDetectPosition = true;
    this.lastGsiAt = 0;
    this.lastSeenPublishedAt = 0;
    this.update({
      enabled: false,
      phase: 'off',
      message: null,
      latestAnalysisId: null,
      latestAnalysis: null,
      lastSeenAt: this.state.lastSeenAt,
      dotaDetected: false,
      draftActive: false,
      refreshPending: false,
      draftOrientation: null,
      recognition: null,
    });
    if (persist) await this.preferences.setAssistantEnabled(false);
  }

  private handleGsi(payload: GsiPayload): void {
    if (!this.state.enabled) return;
    const now = Date.now();
    this.lastGsiAt = now;
    const publishLastSeen = this.lastSeenPublishedAt === 0
      || now - this.lastSeenPublishedAt >= lastSeenPublishIntervalMs;
    if (publishLastSeen) this.lastSeenPublishedAt = now;
    const publishLiveness = publishLastSeen || !this.state.dotaDetected;
    const lastSeenAt = publishLastSeen ? new Date(now).toISOString() : this.state.lastSeenAt;
    const nextTeam = payload.player === undefined ? undefined : resolveGsiTeam(payload);
    const nextHero = payload.hero === undefined ? undefined : resolveGsiHeroSignal(payload);
    const gameState = payload.map?.game_state;
    if (!gameState) {
      if (nextTeam !== undefined) this.localTeam = nextTeam;
      if (nextHero !== undefined) this.localHero = nextHero;
      if (publishLiveness) {
        this.update({
          ...this.state,
          dotaDetected: true,
          lastSeenAt,
        });
      }
      if (this.applyAutomaticOrientation(this.state.recognition ?? null)) this.scheduleCapture();
      return;
    }

    const nextInDraft = isDraftState(gameState);
    const startingDraft = nextInDraft && !this.inDraft;
    const endingDraft = !nextInDraft && this.inDraft;
    if (startingDraft) {
      this.startDraftSession();
    } else if (endingDraft) {
      this.endDraftSession(
        (this.state.recognition?.recognized.filter((pick) => pick.heroId !== null).length ?? 0) >= 10
          ? 'completed'
          : 'left_draft',
      );
    }
    if (nextTeam !== undefined) this.localTeam = nextTeam;
    if (nextHero !== undefined) this.localHero = nextHero;

    if (!nextInDraft) {
      if (endingDraft || this.state.phase !== 'ready') {
        const phase = endingDraft && this.state.phase === 'ready' ? 'ready' : 'waiting_for_dota';
        const message = endingDraft && this.state.phase === 'ready'
          ? 'Драфт завершён'
          : 'Dota 2 запущена. Ждём этап выбора героев';
        if (
          publishLiveness
          || endingDraft
          || phase !== this.state.phase
          || message !== this.state.message
        ) {
          this.update({
            ...this.state,
            phase,
            message,
            dotaDetected: true,
            lastSeenAt,
            draftOrientation: null,
          });
        }
      } else if (publishLiveness) {
        this.update({
          ...this.state,
          dotaDetected: true,
          lastSeenAt,
        });
      }
      return;
    }
    const hasCurrentAnalysis = this.state.latestAnalysis !== null;
    const phase = this.busy
      ? this.state.phase
      : hasCurrentAnalysis
        ? 'ready'
        : 'watching_draft';
    const message = this.busy
      ? this.state.message
      : hasCurrentAnalysis
        ? 'Контрпики готовы — следим за новыми пиками'
        : 'Следим за изменениями драфта';
    if (
      publishLiveness
      || startingDraft
      || phase !== this.state.phase
      || message !== this.state.message
    ) {
      this.update({
        ...this.state,
        phase,
        message,
        latestAnalysisId: startingDraft ? null : this.state.latestAnalysisId,
        latestAnalysis: startingDraft ? null : this.state.latestAnalysis,
        recognition: startingDraft ? null : this.state.recognition,
        draftOrientation: startingDraft ? null : this.state.draftOrientation,
        dotaDetected: true,
        lastSeenAt,
      });
    }
    this.applyAutomaticOrientation(this.state.recognition ?? null);
    this.scheduleCapture();
  }

  private startDraftSession(): void {
    this.invalidateCapture();
    this.inDraft = true;
    this.lastFingerprint = null;
    this.lastCaptureAt = 0;
    this.revision = 0;
    this.sessionId = randomUUID();
    this.requestFingerprint = null;
    this.requestKey = null;
    this.requestImage = null;
    this.requestAllyGroup = null;
    this.requestOrientationSource = null;
    this.liveAnalysisId = null;
    this.liveSessionToken = null;
    this.refreshRequested = false;
    this.retryRequested = false;
    this.forceRefresh = false;
    this.autoDetectPosition = true;
    this.localHero = null;
    this.automaticAllyGroup = null;
    this.manualAllyGroup = null;
    this.requestAttempt = 0;
    this.reportDiagnostic({
      type: 'draft_started',
      status: 'info',
      stage: 'draft',
      durationMs: null,
      details: { draftSessionId: this.sessionId },
    });
  }

  private endDraftSession(reason: 'completed' | 'left_draft' | 'assistant_disabled' | 'mode_changed' | 'error'): void {
    this.reportDiagnostic({
      type: 'draft_ended',
      status: reason === 'completed' ? 'success' : reason === 'error' ? 'error' : 'info',
      stage: 'draft',
      durationMs: null,
      details: { reason },
    });
    this.invalidateCapture();
    this.inDraft = false;
    this.lastFingerprint = null;
    this.requestFingerprint = null;
    this.requestKey = null;
    this.requestImage = null;
    this.requestAllyGroup = null;
    this.requestOrientationSource = null;
    this.liveAnalysisId = null;
    this.liveSessionToken = null;
    this.localTeam = null;
    this.localHero = null;
    this.automaticAllyGroup = null;
    this.manualAllyGroup = null;
    this.refreshRequested = false;
    this.retryRequested = false;
    this.forceRefresh = false;
  }

  private scheduleCapture(): void {
    if (!this.inDraft || this.busy || this.captureTimer) return;
    const intervalMs = this.options.captureIntervalMs ?? captureIntervalMs;
    const debounceMs = this.options.captureDebounceMs ?? captureDebounceMs;
    const waitForRateLimit = Math.max(0, intervalMs - (Date.now() - this.lastCaptureAt));
    const delay = Math.max(debounceMs, waitForRateLimit);
    this.captureTimer = setTimeout(() => {
      this.captureTimer = null;
      void this.capture();
    }, delay);
  }

  private async capture(): Promise<void> {
    if (!this.inDraft || this.busy) return;
    const generation = this.captureGeneration;
    let requestStartedAt: number | null = null;
    let requestRevision = this.revision;
    this.busy = true;
    try {
      const hashImage = await this.captureDotaWindow(hashWatchThumbnailSize);
      if (!this.isCurrentCapture(generation)) return;
      this.lastCaptureAt = Date.now();
      if (!hashImage) {
        this.reportDiagnostic({
          type: 'capture_decision',
          status: 'warning',
          stage: 'capture',
          durationMs: null,
          details: {
            revision: this.revision,
            distance: null,
            decision: 'no_window',
          },
        });
        this.update({
          ...this.state,
          phase: 'waiting_for_dota',
          message: 'Окно Dota 2 не найдено. Используйте оконный режим без рамки',
          dotaDetected: false,
        });
        return;
      }
      const nextFingerprint = createDraftFrameFingerprint(hashImage);
      const distance = this.lastFingerprint
        ? draftFrameDistance(this.lastFingerprint, nextFingerprint)
        : null;
      const unchanged = Boolean(
        this.lastFingerprint
        && draftFramesMatch(this.lastFingerprint, nextFingerprint),
      );
      const currentPreferences = await this.preferences.get();
      if (!this.isCurrentCapture(generation)) return;
      const orientation = this.getDraftOrientation();
      const configuredAllyGroup = orientation?.allyGroup ?? null;
      const configuredOrientationSource = orientation?.source === 'manual_confirmation'
        ? 'manual_confirmation' as const
        : orientation
          ? 'gsi_player_hero' as const
          : null;
      const orientationChanged = configuredAllyGroup !== this.requestAllyGroup;
      const retryingFailedFrame = unchanged
        && !orientationChanged
        && this.requestFingerprint !== null
        && draftFramesMatch(this.requestFingerprint, nextFingerprint)
        && this.requestKey !== null
        && !this.refreshRequested
        && !this.forceRefresh
        && this.retryRequested;
      const previousDetectedPosition = this.autoDetectPosition
        ? this.state.recognition?.detectedPosition ?? null
        : null;
      const requestPosition = previousDetectedPosition ?? currentPreferences.position;
      const shouldDetectPosition = this.autoDetectPosition && previousDetectedPosition === null;
      const captureDecision = retryingFailedFrame
        ? 'retry' as const
        : this.forceRefresh || orientationChanged
          ? 'forced' as const
          : unchanged
            ? 'unchanged' as const
            : 'changed' as const;
      const captureRevision = captureDecision === 'changed' || captureDecision === 'forced'
        ? Math.min(10_000, this.revision + 1)
        : Math.min(10_000, this.revision);
      this.reportDiagnostic({
        type: 'capture_decision',
        status: 'info',
        stage: 'capture',
        durationMs: null,
        details: {
          revision: captureRevision,
          distance,
          decision: captureDecision,
        },
      });
      if (unchanged && !orientationChanged && !retryingFailedFrame && !this.forceRefresh) {
        const hasCurrentAnalysis = analysisMatchesPreferences(
          this.state.latestAnalysis,
          currentPreferences,
          this.state.recognition?.detectedPosition ?? null,
        );
        this.refreshRequested = false;
        this.retryRequested = false;
        const phase = hasCurrentAnalysis ? 'ready' : 'watching_draft';
        const message = hasCurrentAnalysis ? 'Новых пиков пока нет' : 'Драфт не изменился';
        if (
          phase !== this.state.phase
          || message !== this.state.message
          || this.state.refreshPending
        ) {
          this.update({
            ...this.state,
            phase,
            message,
          });
        }
        return;
      }
      let uploadImage: NativeImage | null = null;
      if (!retryingFailedFrame) {
        uploadImage = await this.captureDotaWindow(uploadThumbnailSize);
        if (!this.isCurrentCapture(generation)) return;
        if (!uploadImage) {
          this.update({
            ...this.state,
            phase: 'waiting_for_dota',
            message: 'Окно Dota 2 не найдено. Используйте оконный режим без рамки',
            dotaDetected: false,
          });
          return;
        }
      }
      if (this.refreshRequested) {
        this.refreshRequested = false;
        this.retryRequested = false;
        this.forceRefresh = false;
      }
      this.lastFingerprint = nextFingerprint;
      this.lastCaptureAt = Date.now();
      if (!retryingFailedFrame) {
        if (!uploadImage) {
          throw new DesktopError('CAPTURE_STATE_INVALID', 'Не удалось подготовить кадр для анализа');
        }
        this.revision += 1;
        this.requestFingerprint = nextFingerprint;
        this.requestKey = randomUUID();
        this.requestImage = fitForUpload(uploadImage).toPNG();
        this.requestAllyGroup = configuredAllyGroup;
        this.requestOrientationSource = configuredOrientationSource;
        this.retryRequested = false;
        this.requestAttempt = 1;
      } else {
        this.requestAttempt = Math.min(20, this.requestAttempt + 1);
      }
      this.update({
        ...this.state,
        phase: 'recognizing',
        message: 'Распознаём выбранных героев',
        latestAnalysisId: this.state.latestAnalysisId,
        latestAnalysis: this.state.latestAnalysis,
      });
      this.analyzingTimer = setTimeout(() => {
        if (
          !this.isCurrentCapture(generation)
          || !this.busy
          || this.state.phase !== 'recognizing'
        ) {
          return;
        }
        this.update({
          ...this.state,
          phase: 'analyzing',
          message: 'Считаем контрпики',
        });
      }, 4_000);
      if (!this.requestKey || !this.requestImage) {
        throw new DesktopError('CAPTURE_STATE_INVALID', 'Не удалось подготовить кадр для анализа');
      }
      const activeAnalysisId = this.liveAnalysisId;
      const activeLiveSessionToken = this.liveSessionToken;
      const operation = activeAnalysisId && activeLiveSessionToken ? 'revise' as const : 'create' as const;
      requestStartedAt = performance.now();
      requestRevision = this.revision;
      this.reportDiagnostic({
        type: 'request_started',
        status: 'info',
        stage: 'request',
        durationMs: null,
        details: {
          revision: requestRevision,
          operation,
          attempt: this.requestAttempt,
        },
      });
      const response = activeAnalysisId && activeLiveSessionToken
        ? await this.api.reviseDesktop(
            activeAnalysisId,
            this.requestImage,
            requestPosition,
            currentPreferences.rank,
            this.sessionId,
            this.revision,
            this.requestKey,
            shouldDetectPosition,
            this.requestAllyGroup,
            this.requestOrientationSource,
            activeLiveSessionToken,
          )
        : await this.api.analyzeDesktop(
            this.requestImage,
            requestPosition,
            currentPreferences.rank,
            this.sessionId,
            this.revision,
            this.requestKey,
            shouldDetectPosition,
            this.requestAllyGroup,
            this.requestOrientationSource,
          );
      if (!this.isCurrentCapture(generation)) return;
      if (this.analyzingTimer) clearTimeout(this.analyzingTimer);
      this.analyzingTimer = null;
      if (response.revision !== this.revision) {
        const latencyMs = Math.min(120_000, Math.round(performance.now() - requestStartedAt));
        this.reportDiagnostic({
          type: 'request_completed',
          status: 'warning',
          stage: 'request',
          durationMs: latencyMs,
          details: {
            revision: response.revision,
            outcome: 'stale',
            latencyMs,
            ...analysisDiagnostic(response),
          },
        });
        this.requestKey = null;
        this.requestImage = null;
        this.refreshRequested = true;
        this.retryRequested = false;
        this.forceRefresh = true;
        this.update({
          ...this.state,
          phase: 'watching_draft',
          message: 'Пики изменились — обновляем рекомендации',
        });
        return;
      }
      const latestFrame = await this.captureDotaWindow(hashWatchThumbnailSize);
      if (!this.isCurrentCapture(generation)) return;
      const responseFrameIsCurrent = Boolean(
        latestFrame
        && this.requestFingerprint
        && draftFramesMatch(
          this.requestFingerprint,
          createDraftFrameFingerprint(latestFrame),
        ),
      );
      if (!responseFrameIsCurrent) {
        const latencyMs = Math.min(120_000, Math.round(performance.now() - requestStartedAt));
        this.reportDiagnostic({
          type: 'request_completed',
          status: 'warning',
          stage: 'request',
          durationMs: latencyMs,
          details: {
            revision: response.revision,
            outcome: 'stale',
            latencyMs,
            ...analysisDiagnostic(response),
          },
        });
        if (response.status === 'completed') this.liveAnalysisId = response.analysis.id;
        if (response.liveSession) this.liveSessionToken = response.liveSession.token;
        this.requestFingerprint = null;
        this.requestKey = null;
        this.requestImage = null;
        this.refreshRequested = true;
        this.retryRequested = false;
        this.forceRefresh = true;
        this.lastCaptureAt = 0;
        visionLog.info('Draft recognition discarded', {
          reason: latestFrame ? 'frame_changed_during_request' : 'dota_window_unavailable',
          revision: response.revision,
          responseStatus: response.status,
        });
        this.update({
          ...this.state,
          phase: latestFrame ? 'watching_draft' : 'waiting_for_dota',
          message: latestFrame
            ? 'Пики изменились — проверяем свежий кадр'
            : 'Окно Dota 2 не найдено. Используйте оконный режим без рамки',
          dotaDetected: Boolean(latestFrame),
        });
        return;
      }
      const recognition = this.autoDetectPosition
        ? {
            ...response.recognition,
            detectedPosition: response.recognition.detectedPosition ?? previousDetectedPosition,
          }
        : { ...response.recognition, detectedPosition: null };
      this.reportRecognition(recognition);
      if (this.applyAutomaticOrientation(recognition)) {
        const latencyMs = Math.min(120_000, Math.round(performance.now() - requestStartedAt));
        this.reportDiagnostic({
          type: 'request_completed',
          status: 'warning',
          stage: 'request',
          durationMs: latencyMs,
          details: {
            revision: response.revision,
            outcome: 'stale',
            latencyMs,
            ...analysisDiagnostic(response),
          },
        });
        this.requestKey = null;
        this.requestImage = null;
        return;
      }
      if (response.status === 'waiting') {
        const latencyMs = Math.min(120_000, Math.round(performance.now() - requestStartedAt));
        this.reportDiagnostic({
          type: 'request_completed',
          status: 'warning',
          stage: 'request',
          durationMs: latencyMs,
          details: {
            revision: response.revision,
            outcome: 'waiting',
            waitingReason: response.reason,
            latencyMs,
          },
        });
        this.requestKey = null;
        this.requestImage = null;
        this.retryRequested = false;
        const hasCurrentAnalysis = this.state.latestAnalysis !== null;
        this.update({
          ...this.state,
          phase: hasCurrentAnalysis ? 'ready' : 'watching_draft',
          message: waitingMessages[response.reason],
          latestAnalysisId: this.state.latestAnalysisId,
          latestAnalysis: this.state.latestAnalysis,
          recognition: this.recognitionForWaitingState(response.reason, recognition),
        });
        return;
      }
      const refreshQueuedDuringAnalysis = this.refreshRequested;
      this.liveAnalysisId = response.analysis.id;
      if (response.liveSession) this.liveSessionToken = response.liveSession.token;
      this.requestKey = null;
      this.requestImage = null;
      this.retryRequested = false;
      const latencyMs = Math.min(120_000, Math.round(performance.now() - requestStartedAt));
      this.reportDiagnostic({
        type: 'request_completed',
        status: 'success',
        stage: 'request',
        durationMs: latencyMs,
        details: {
          revision: response.revision,
          outcome: 'completed',
          latencyMs,
          ...analysisDiagnostic(response),
        },
      });
      this.update({
        ...this.state,
        phase: refreshQueuedDuringAnalysis ? 'watching_draft' : 'ready',
        message: refreshQueuedDuringAnalysis ? 'Проверяем новые пики' : 'Контрпики готовы',
        latestAnalysisId: response.analysis.id,
        latestAnalysis: response.analysis,
        recognition,
      });
    } catch (error) {
      if (!this.isCurrentCapture(generation)) return;
      if (this.analyzingTimer) clearTimeout(this.analyzingTimer);
      this.analyzingTimer = null;
      const liveSessionInvalid = error instanceof DesktopError
        && error.code === 'DESKTOP_LIVE_SESSION_INVALID';
      const retryable = liveSessionInvalid || isRetryableAnalysisError(error);
      this.reportDiagnostic({
        type: 'engine_error',
        status: 'error',
        stage: 'engine',
        durationMs: null,
        details: {
          code: safeDiagnosticErrorCode(error),
          recoverable: retryable,
          stage: requestStartedAt === null ? 'capture' : 'request',
        },
      });
      if (requestStartedAt !== null) {
        const latencyMs = Math.min(120_000, Math.round(performance.now() - requestStartedAt));
        this.reportDiagnostic({
          type: 'request_completed',
          status: 'error',
          stage: 'request',
          durationMs: latencyMs,
          details: {
            revision: requestRevision,
            outcome: 'error',
            latencyMs,
            errorCode: safeDiagnosticErrorCode(error),
            recoverable: retryable,
          },
        });
      }
      if (liveSessionInvalid) {
        this.liveAnalysisId = null;
        this.liveSessionToken = null;
        this.sessionId = randomUUID();
        this.requestFingerprint = null;
        this.requestKey = null;
        this.requestImage = null;
        this.refreshRequested = true;
        this.retryRequested = false;
        this.forceRefresh = true;
        this.update({
          ...this.state,
          phase: 'watching_draft',
          message: 'Сессия Draft Vision обновляется',
        });
        return;
      }
      const isQuota = error instanceof DesktopError
        && (error.code === 'QUOTA_EXHAUSTED' || error.status === 402);
      if (isQuota) {
        this.refreshRequested = false;
        this.forceRefresh = false;
        this.requestKey = null;
        this.requestImage = null;
      }
      const refreshQueuedDuringAnalysis = !isQuota && this.refreshRequested;
      if (!isQuota && !refreshQueuedDuringAnalysis && !retryable) {
        this.requestKey = null;
        this.requestImage = null;
      }
      this.retryRequested = !refreshQueuedDuringAnalysis
        && this.requestKey !== null
        && retryable;
      this.update({
        ...this.state,
        phase: isQuota ? 'quota' : refreshQueuedDuringAnalysis ? 'watching_draft' : 'error',
        message: isQuota
          ? 'Лимит попыток исчерпан'
          : refreshQueuedDuringAnalysis
            ? 'Перезапускаем анализ с новыми настройками'
            : error instanceof Error
              ? error.message
              : 'Не удалось проанализировать драфт',
      });
    } finally {
      if (generation === this.captureGeneration) {
        this.busy = false;
        if (this.inDraft && this.state.phase !== 'quota') {
          this.scheduleCapture();
        }
      }
    }
  }

  private getDraftOrientation(): DraftOrientation | null {
    if (this.manualAllyGroup) {
      return {
        allyGroup: this.manualAllyGroup,
        source: 'manual_confirmation',
      };
    }
    if (this.automaticAllyGroup) {
      return {
        allyGroup: this.automaticAllyGroup,
        source: 'gsi_player_hero',
      };
    }
    return null;
  }

  private recognitionForWaitingState(
    reason: WaitingReason,
    recognition: NonNullable<EngineState['recognition']>,
  ): EngineState['recognition'] {
    if (reason !== 'insufficient_enemy_picks' && reason !== 'no_enemy_picks') {
      return recognition;
    }
    if (this.state.latestAnalysis || this.getDraftOrientation()) {
      return this.state.recognition;
    }
    return {
      ...recognition,
      recognized: recognition.recognized.map((pick) => ({
        ...pick,
        side: 'unknown' as const,
        needsReview: true,
      })),
    };
  }

  private applyAutomaticOrientation(
    recognition: NonNullable<EngineState['recognition']> | null,
  ): boolean {
    if (
      !this.inDraft
      || this.manualAllyGroup
      || this.automaticAllyGroup
      || !this.localTeam
      || !recognition
    ) {
      return false;
    }
    const allyGroup = resolveGsiHeroAllyGroup(this.localHero, recognition.recognized);
    if (!allyGroup) return false;
    this.automaticAllyGroup = allyGroup;
    this.refreshRequested = true;
    this.forceRefresh = true;
    this.retryRequested = false;
    this.update({
      ...this.state,
      phase: this.busy ? this.state.phase : 'watching_draft',
      message: 'Сторона команды определена — обновляем пики',
      draftOrientation: {
        allyGroup,
        source: 'gsi_player_hero',
      },
    });
    visionLog.info('Draft orientation resolved', {
      source: 'gsi_player_hero',
      allyGroup,
    });
    return true;
  }

  private reportRecognition(
    recognition: NonNullable<EngineState['recognition']> & { model?: string },
  ): void {
    const bySide = { ally: 0, enemy: 0, unknown: 0 };
    const byVisualGroup = { left: 0, right: 0, missing: 0 };
    let needsReview = 0;
    let withHero = 0;
    for (const pick of recognition.recognized) {
      bySide[pick.side] += 1;
      if (pick.visualGroup) byVisualGroup[pick.visualGroup] += 1;
      else byVisualGroup.missing += 1;
      if (pick.needsReview) needsReview += 1;
      if (pick.heroId !== null) withHero += 1;
    }
    const orientation = this.getDraftOrientation();
    visionLog.info('Draft recognition completed', {
      quality: recognition.quality,
      model: recognition.model ?? null,
      recognizedCount: recognition.recognized.length,
      withHero,
      needsReview,
      bySide,
      byVisualGroup,
      orientationSource: orientation?.source ?? null,
      orientationRequired: !orientation
        && recognition.recognized.some((pick) => (
          pick.side === 'unknown'
          && pick.visualGroup !== undefined
          && pick.heroId !== null
        )),
    });
    this.reportDiagnostic({
      type: 'recognition_result',
      status: recognition.quality === 'clear' && needsReview === 0 ? 'success' : 'warning',
      stage: 'recognition',
      durationMs: null,
      details: {
        revision: this.revision,
        quality: recognition.quality,
        model: recognition.model?.trim().slice(0, 80) || null,
        recognizedCount: recognition.recognized.length,
        needsReviewCount: needsReview,
        slots: recognition.recognized.map((pick) => ({
          slot: pick.slot,
          side: pick.side,
          visualGroup: pick.visualGroup ?? null,
          heroId: pick.heroId,
          confidence: pick.confidence,
          needsReview: pick.needsReview,
        })),
      },
    });
  }

  private reportDiagnostic(event: DiagnosticEventDraft): void {
    try {
      this.options.diagnostic?.(event);
    } catch {
      return;
    }
  }

  private async captureDotaWindow(thumbnailSize: { width: number; height: number }): Promise<NativeImage | null> {
    if (this.options.captureDotaWindow) return this.options.captureDotaWindow(thumbnailSize);
    const { desktopCapturer } = await import('electron');
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize,
      fetchWindowIcons: false,
    });
    const source = sources.find((candidate) => {
      const name = candidate.name.toLowerCase();
      return name === 'dota 2' || name.includes('dota 2');
    });
    if (!source || source.thumbnail.isEmpty()) return null;
    return source.thumbnail;
  }

  private startWindowPolling(): void {
    if (this.windowPollingActive) return;
    this.windowPollingActive = true;
    this.windowPollIndex = 0;
  }

  private async pollDotaWindow(): Promise<void> {
    if (!this.state.enabled || !this.windowPollingActive || this.windowPollInFlight) return;
    if (this.windowPollTimer) {
      clearTimeout(this.windowPollTimer);
      this.windowPollTimer = null;
    }
    const now = Date.now();
    if (this.inDraft) {
      this.scheduleWindowPoll(windowPollIntervalsMs[windowPollIntervalsMs.length - 1]);
      return;
    }
    const gsiAge = this.lastGsiAt > 0 ? now - this.lastGsiAt : Number.POSITIVE_INFINITY;
    if (gsiAge < gsiFreshnessMs) {
      this.scheduleWindowPoll(Math.max(windowPollIntervalsMs[0], gsiFreshnessMs - gsiAge));
      return;
    }
    const generation = this.captureGeneration;
    this.windowPollInFlight = true;
    let nextDelay = windowPollIntervalsMs[this.windowPollIndex];
    try {
      const { desktopCapturer } = await import('electron');
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false,
      });
      if (!this.state.enabled || generation !== this.captureGeneration) return;
      const dotaDetected = sources.some((candidate) => candidate.name.toLowerCase().includes('dota 2'));
      if (dotaDetected) {
        this.windowPollIndex = windowPollIntervalsMs.length - 1;
        nextDelay = windowPollIntervalsMs[this.windowPollIndex];
      } else {
        if (this.state.dotaDetected) this.windowPollIndex = 0;
        nextDelay = windowPollIntervalsMs[this.windowPollIndex];
        this.windowPollIndex = Math.min(
          this.windowPollIndex + 1,
          windowPollIntervalsMs.length - 1,
        );
      }
      if (dotaDetected !== this.state.dotaDetected) {
        this.update({
          ...this.state,
          dotaDetected,
          message: dotaDetected && !this.inDraft
            ? this.state.lastSeenAt
              ? 'Dota 2 запущена. Ждём этап выбора героев'
              : 'Dota найдена. Проверьте параметр запуска -gamestateintegration'
            : this.state.message,
        });
      }
    } catch {
      nextDelay = windowPollIntervalsMs[this.windowPollIndex];
      this.windowPollIndex = Math.min(
        this.windowPollIndex + 1,
        windowPollIntervalsMs.length - 1,
      );
    } finally {
      this.windowPollInFlight = false;
      this.scheduleWindowPoll(nextDelay);
    }
  }

  private scheduleWindowPoll(delay: number): void {
    if (!this.state.enabled || !this.windowPollingActive || this.windowPollTimer) return;
    this.windowPollTimer = setTimeout(() => {
      this.windowPollTimer = null;
      void this.pollDotaWindow();
    }, delay);
  }

  private update(state: EngineState): void {
    this.state = structuredClone({
      ...state,
      draftActive: this.inDraft,
      refreshPending: this.refreshRequested || this.retryRequested,
    });
    this.emit(this.getState());
  }

  private cancelCapture(): void {
    if (!this.captureTimer) return;
    clearTimeout(this.captureTimer);
    this.captureTimer = null;
  }

  private clearTimers(): void {
    this.cancelCapture();
    this.windowPollingActive = false;
    if (this.windowPollTimer) clearTimeout(this.windowPollTimer);
    if (this.analyzingTimer) clearTimeout(this.analyzingTimer);
    this.windowPollTimer = null;
    this.windowPollIndex = 0;
    this.analyzingTimer = null;
  }

  private invalidateCapture(): void {
    this.captureGeneration += 1;
    this.busy = false;
    this.cancelCapture();
    if (this.analyzingTimer) clearTimeout(this.analyzingTimer);
    this.analyzingTimer = null;
  }

  private isCurrentCapture(generation: number): boolean {
    return (
      generation === this.captureGeneration
      && this.state.enabled
      && this.inDraft
    );
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
