import { randomUUID } from 'node:crypto';
import type { NativeImage } from 'electron';
import type { Analysis, EngineState, Position, Preferences } from '../shared/contracts.js';
import type { ApiClient } from './api-client.js';
import { isRetryableAnalysisError } from './analysis-errors.js';
import { DesktopError } from './errors.js';
import {
  GsiReceiver,
  resolveConfiguredAllyGroup,
  resolveGsiTeam,
  type DraftAllyGroup,
  type GsiPayload,
  type GsiTeam,
} from './gsi.js';
import type { PreferencesStore } from './preferences-store.js';

const captureIntervalMs = 5_000;
const captureDebounceMs = 1_500;
const gsiFreshnessMs = 20_000;
const lastSeenPublishIntervalMs = 10_000;
const windowPollIntervalsMs = [10_000, 20_000, 30_000] as const;
const hashWatchThumbnailSize = { width: 320, height: 180 };
const uploadThumbnailSize = { width: 1600, height: 900 };

type DraftEngineOptions = {
  captureDotaWindow?: (thumbnailSize: { width: number; height: number }) => Promise<NativeImage | null>;
  captureIntervalMs?: number;
  captureDebounceMs?: number;
};
const waitingMessages = {
  not_dota_draft: 'Не вижу экран выбора героев. Включите режим «Окно без рамки»',
  image_unclear: 'Кадр нечёткий. Откройте Dota 2 и используйте режим «Окно без рамки»',
  uncertain_picks: 'Не все герои распознаны уверенно. Ждём следующий кадр',
  insufficient_enemy_picks: 'Ждём минимум два пика соперника',
  no_enemy_picks: 'Ждём первый пик соперника',
} as const;

function isDraftState(gameState: string): boolean {
  return gameState.includes('HERO_SELECTION') || gameState.includes('STRATEGY_TIME');
}

function imageHash(image: NativeImage): string {
  const size = image.getSize();
  const bandHeight = Math.max(1, Math.round(size.height * 0.22));
  const sideWidth = Math.max(1, Math.round(size.width * 0.44));
  const left = image.crop({ x: 0, y: 0, width: sideWidth, height: bandHeight })
    .resize({ width: 24, height: 6, quality: 'good' });
  const right = image.crop({
    x: size.width - sideWidth,
    y: 0,
    width: sideWidth,
    height: bandHeight,
  }).resize({ width: 24, height: 6, quality: 'good' });
  const pixels = Buffer.concat([left.toBitmap(), right.toBitmap()]);
  const luminance: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    luminance.push(
      pixels[index] * 0.0722
      + pixels[index + 1] * 0.7152
      + pixels[index + 2] * 0.2126,
    );
  }
  const average = luminance.reduce((sum, value) => sum + value, 0) / Math.max(luminance.length, 1);
  let hash = '';
  for (let offset = 0; offset < luminance.length; offset += 4) {
    let nibble = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      if ((luminance[offset + bit] ?? 0) >= average) nibble |= 1 << (3 - bit);
    }
    hash += nibble.toString(16);
  }
  return hash;
}

function hashDistance(left: string, right: string): number {
  let distance = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    let value = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    while (value) {
      distance += value & 1;
      value >>= 1;
    }
  }
  return distance + Math.abs(left.length - right.length) * 4;
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
  private lastHash: string | null = null;
  private lastCaptureAt = 0;
  private revision = 0;
  private sessionId = randomUUID();
  private requestHash: string | null = null;
  private requestKey: string | null = null;
  private requestImage: Buffer | null = null;
  private requestAllyGroup: DraftAllyGroup | null = null;
  private liveAnalysisId: string | null = null;
  private liveSessionToken: string | null = null;
  private localTeam: GsiTeam | null = null;
  private refreshRequested = false;
  private retryRequested = false;
  private forceRefresh = false;
  private autoDetectPosition = true;

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

  async suspend(): Promise<EngineState> {
    return this.enqueueTransition(async () => {
      await this.disable(false);
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
      this.update({
        ...this.state,
        enabled: true,
        phase: 'error',
        message: error instanceof Error ? error.message : 'Не удалось запустить помощник',
      });
    }
  }

  private async disable(persist = true): Promise<void> {
    this.invalidateCapture();
    this.clearTimers();
    await this.gsi.stop();
    this.inDraft = false;
    this.lastHash = null;
    this.requestHash = null;
    this.requestKey = null;
    this.requestImage = null;
    this.requestAllyGroup = null;
    this.liveAnalysisId = null;
    this.liveSessionToken = null;
    this.localTeam = null;
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
    if (payload.player) this.localTeam = resolveGsiTeam(payload);
    const gameState = payload.map?.game_state;
    if (!gameState) {
      if (publishLiveness) {
        this.update({
          ...this.state,
          dotaDetected: true,
          lastSeenAt,
        });
      }
      return;
    }

    const nextInDraft = isDraftState(gameState);
    const startingDraft = nextInDraft && !this.inDraft;
    const endingDraft = !nextInDraft && this.inDraft;
    if (startingDraft) {
      this.startDraftSession();
    } else if (endingDraft) {
      this.endDraftSession();
    }

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
        dotaDetected: true,
        lastSeenAt,
      });
    }
    this.scheduleCapture();
  }

  private startDraftSession(): void {
    this.invalidateCapture();
    this.inDraft = true;
    this.lastHash = null;
    this.lastCaptureAt = 0;
    this.revision = 0;
    this.sessionId = randomUUID();
    this.requestHash = null;
    this.requestKey = null;
    this.requestImage = null;
    this.requestAllyGroup = null;
    this.liveAnalysisId = null;
    this.liveSessionToken = null;
    this.refreshRequested = false;
    this.retryRequested = false;
    this.forceRefresh = false;
    this.autoDetectPosition = true;
  }

  private endDraftSession(): void {
    this.invalidateCapture();
    this.inDraft = false;
    this.lastHash = null;
    this.requestHash = null;
    this.requestKey = null;
    this.requestImage = null;
    this.requestAllyGroup = null;
    this.liveAnalysisId = null;
    this.liveSessionToken = null;
    this.localTeam = null;
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
    this.busy = true;
    try {
      const hashImage = await this.captureDotaWindow(hashWatchThumbnailSize);
      if (!this.isCurrentCapture(generation)) return;
      this.lastCaptureAt = Date.now();
      if (!hashImage) {
        this.update({
          ...this.state,
          phase: 'waiting_for_dota',
          message: 'Окно Dota 2 не найдено. Используйте оконный режим без рамки',
          dotaDetected: false,
        });
        return;
      }
      const nextHash = imageHash(hashImage);
      const unchanged = Boolean(this.lastHash && hashDistance(this.lastHash, nextHash) < 14);
      const currentPreferences = await this.preferences.get();
      if (!this.isCurrentCapture(generation)) return;
      const configuredAllyGroup = resolveConfiguredAllyGroup(
        this.localTeam,
        currentPreferences.radiantDraftSide,
      );
      const orientationChanged = configuredAllyGroup !== this.requestAllyGroup;
      const retryingFailedFrame = unchanged
        && !orientationChanged
        && this.requestHash !== null
        && hashDistance(this.requestHash, nextHash) < 14
        && this.requestKey !== null
        && !this.refreshRequested
        && !this.forceRefresh
        && this.retryRequested;
      const previousDetectedPosition = this.autoDetectPosition
        ? this.state.recognition?.detectedPosition ?? null
        : null;
      const requestPosition = previousDetectedPosition ?? currentPreferences.position;
      const shouldDetectPosition = this.autoDetectPosition && previousDetectedPosition === null;
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
      this.lastHash = nextHash;
      this.lastCaptureAt = Date.now();
      if (!retryingFailedFrame) {
        if (!uploadImage) {
          throw new DesktopError('CAPTURE_STATE_INVALID', 'Не удалось подготовить кадр для анализа');
        }
        this.revision += 1;
        this.requestHash = nextHash;
        this.requestKey = randomUUID();
        this.requestImage = fitForUpload(uploadImage).toPNG();
        this.requestAllyGroup = configuredAllyGroup;
        this.retryRequested = false;
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
      const response = this.liveAnalysisId && this.liveSessionToken
        ? await this.api.reviseDesktop(
            this.liveAnalysisId,
            this.requestImage,
            requestPosition,
            currentPreferences.rank,
            this.sessionId,
            this.revision,
            this.requestKey,
            shouldDetectPosition,
            this.requestAllyGroup,
            this.requestAllyGroup ? 'gsi_layout_heuristic' : null,
            this.liveSessionToken,
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
            this.requestAllyGroup ? 'gsi_layout_heuristic' : null,
          );
      if (!this.isCurrentCapture(generation)) return;
      if (this.analyzingTimer) clearTimeout(this.analyzingTimer);
      this.analyzingTimer = null;
      if (response.revision !== this.revision) {
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
      const recognition = this.autoDetectPosition
        ? {
            ...response.recognition,
            detectedPosition: response.recognition.detectedPosition ?? previousDetectedPosition,
          }
        : { ...response.recognition, detectedPosition: null };
      if (response.status === 'waiting') {
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
          recognition,
        });
        return;
      }
      const refreshQueuedDuringAnalysis = this.refreshRequested;
      this.liveAnalysisId = response.analysis.id;
      if (response.liveSession) this.liveSessionToken = response.liveSession.token;
      this.requestKey = null;
      this.requestImage = null;
      this.retryRequested = false;
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
      if (liveSessionInvalid) {
        this.liveAnalysisId = null;
        this.liveSessionToken = null;
        this.sessionId = randomUUID();
        this.requestHash = null;
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
      const retryable = isRetryableAnalysisError(error);
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
