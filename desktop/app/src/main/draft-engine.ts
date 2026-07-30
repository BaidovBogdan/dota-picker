import { randomUUID } from 'node:crypto';
import { desktopCapturer, screen, type NativeImage } from 'electron';
import type { EngineState } from '../shared/contracts.js';
import type { ApiClient } from './api-client.js';
import { DesktopError } from './errors.js';
import { GsiReceiver, type GsiPayload } from './gsi.js';
import type { PreferencesStore } from './preferences-store.js';

const captureIntervalMs = 21_000;
const captureDebounceMs = 1_500;
const waitingMessages = {
  not_dota_draft: 'Не вижу экран выбора героев. Включите режим «Окно без рамки»',
  image_unclear: 'Кадр нечёткий. Откройте Dota 2 и используйте режим «Окно без рамки»',
  uncertain_picks: 'Не все герои распознаны уверенно. Ждём следующий кадр',
  no_enemy_picks: 'Ждём первый пик соперника',
} as const;

function isDraftState(gameState: string): boolean {
  return gameState.includes('HERO_SELECTION') || gameState.includes('STRATEGY_TIME');
}

function imageHash(image: NativeImage): string {
  const resized = image.resize({ width: 16, height: 9, quality: 'good' });
  const pixels = resized.toBitmap();
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
    lastSeenAt: null,
    dotaDetected: false,
    recognition: null,
  };
  private captureTimer: NodeJS.Timeout | null = null;
  private processTimer: NodeJS.Timeout | null = null;
  private analyzingTimer: NodeJS.Timeout | null = null;
  private transitionQueue: Promise<void> = Promise.resolve();
  private captureGeneration = 0;
  private pollingDotaWindow = false;
  private inDraft = false;
  private sessionCompleted = false;
  private busy = false;
  private lastHash: string | null = null;
  private lastCaptureAt = 0;
  private revision = 0;
  private sessionId = randomUUID();
  private requestHash: string | null = null;
  private requestKey: string | null = null;
  private requestImage: Buffer | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly preferences: PreferencesStore,
    private readonly gsi: GsiReceiver,
    private readonly emit: (state: EngineState) => void,
  ) {}

  getState(): EngineState {
    return structuredClone(this.state);
  }

  async restore(): Promise<void> {
    const preferences = await this.preferences.get();
    if (preferences.assistantEnabled && preferences.captureConsent.accepted) {
      await this.setEnabled(true);
    }
  }

  async setEnabled(enabled: boolean): Promise<EngineState> {
    return this.enqueueTransition(async () => {
      if (enabled) await this.enable();
      else await this.disable();
      return this.getState();
    });
  }

  async retry(): Promise<EngineState> {
    if (!this.state.enabled) return this.setEnabled(true);
    if (this.sessionCompleted) return this.getState();
    if (this.inDraft) this.scheduleCapture(true);
    else if (this.state.phase === 'error') return this.setEnabled(true);
    else await this.pollDotaWindow();
    return this.getState();
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
    await this.preferences.setAssistantEnabled(true);
    this.update({
      enabled: true,
      phase: 'starting',
      message: 'Подключаемся к Dota 2',
      latestAnalysisId: this.state.latestAnalysisId,
      lastSeenAt: this.state.lastSeenAt,
      dotaDetected: false,
      recognition: null,
    });
    try {
      const installation = await this.gsi.start((payload) => this.handleGsi(payload));
      this.startWindowPolling();
      this.update({
        ...this.state,
        phase: 'waiting_for_dota',
        message: installation.installed
          ? 'Запустите Dota 2 — помощник включится на этапе выбора героев'
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
    if (persist) await this.preferences.setAssistantEnabled(false);
    this.invalidateCapture();
    this.clearTimers();
    await this.gsi.stop();
    this.inDraft = false;
    this.sessionCompleted = false;
    this.lastHash = null;
    this.requestHash = null;
    this.requestKey = null;
    this.requestImage = null;
    this.update({
      enabled: false,
      phase: 'off',
      message: null,
      latestAnalysisId: this.state.latestAnalysisId,
      lastSeenAt: this.state.lastSeenAt,
      dotaDetected: false,
      recognition: null,
    });
  }

  private handleGsi(payload: GsiPayload): void {
    if (!this.state.enabled) return;
    const now = new Date().toISOString();
    const gameState = payload.map?.game_state;
    this.update({
      ...this.state,
      dotaDetected: true,
      lastSeenAt: now,
    });
    if (!gameState) return;

    const nextInDraft = isDraftState(gameState);
    if (nextInDraft && !this.inDraft) {
      this.invalidateCapture();
      this.inDraft = true;
      this.sessionCompleted = false;
      this.lastHash = null;
      this.lastCaptureAt = 0;
      this.revision = 0;
      this.sessionId = randomUUID();
      this.requestHash = null;
      this.requestKey = null;
      this.requestImage = null;
    } else if (!nextInDraft && this.inDraft) {
      this.invalidateCapture();
      this.inDraft = false;
      this.sessionCompleted = false;
      this.lastHash = null;
      this.requestHash = null;
      this.requestKey = null;
      this.requestImage = null;
    }

    if (!nextInDraft) {
      if (this.state.phase !== 'ready') {
        this.update({
          ...this.state,
          phase: 'waiting_for_dota',
          message: 'Dota 2 запущена. Ждём этап выбора героев',
        });
      }
      return;
    }
    if (this.sessionCompleted) return;
    this.update({
      ...this.state,
      phase: this.busy ? this.state.phase : 'watching_draft',
      message: this.busy ? this.state.message : 'Следим за изменениями драфта',
    });
    this.scheduleCapture();
  }

  private scheduleCapture(force = false): void {
    if (!this.inDraft || this.sessionCompleted || this.busy || this.captureTimer) return;
    const waitForRateLimit = Math.max(0, captureIntervalMs - (Date.now() - this.lastCaptureAt));
    const delay = force ? 0 : Math.max(captureDebounceMs, waitForRateLimit);
    this.captureTimer = setTimeout(() => {
      this.captureTimer = null;
      void this.capture();
    }, delay);
  }

  private async capture(): Promise<void> {
    if (!this.inDraft || this.sessionCompleted || this.busy) return;
    const generation = this.captureGeneration;
    this.busy = true;
    try {
      const image = await this.captureDotaWindow();
      if (!this.isCurrentCapture(generation)) return;
      this.lastCaptureAt = Date.now();
      if (!image) {
        this.update({
          ...this.state,
          phase: 'waiting_for_dota',
          message: 'Окно Dota 2 не найдено. Используйте оконный режим без рамки',
          dotaDetected: false,
        });
        return;
      }
      const nextHash = imageHash(image);
      const unchanged = Boolean(this.lastHash && hashDistance(this.lastHash, nextHash) < 7);
      const retryingFailedFrame = unchanged
        && this.requestHash === nextHash
        && this.requestKey !== null
        && this.state.phase === 'error';
      if (unchanged && !retryingFailedFrame) {
        this.update({
          ...this.state,
          phase: 'watching_draft',
          message: 'Драфт не изменился',
        });
        return;
      }
      this.lastHash = nextHash;
      this.lastCaptureAt = Date.now();
      if (!retryingFailedFrame) {
        this.revision += 1;
        this.requestHash = nextHash;
        this.requestKey = randomUUID();
        this.requestImage = image.toPNG();
      }
      this.update({
        ...this.state,
        phase: 'recognizing',
        message: 'Распознаём выбранных героев',
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
      const preferences = await this.preferences.get();
      if (!this.isCurrentCapture(generation)) return;
      const response = await this.api.analyzeDesktop(
        this.requestImage,
        preferences.position,
        preferences.rank,
        this.sessionId,
        this.revision,
        this.requestKey,
      );
      if (!this.isCurrentCapture(generation)) return;
      if (this.analyzingTimer) clearTimeout(this.analyzingTimer);
      this.analyzingTimer = null;
      if (response.status === 'waiting') {
        this.requestKey = null;
        this.requestImage = null;
        this.update({
          ...this.state,
          phase: 'watching_draft',
          message: waitingMessages[response.reason],
          recognition: response.recognition,
        });
        return;
      }
      this.sessionCompleted = true;
      this.requestKey = null;
      this.requestImage = null;
      this.update({
        ...this.state,
        phase: 'ready',
        message: 'Контрпики готовы',
        latestAnalysisId: response.analysis.id,
        recognition: response.recognition,
      });
    } catch (error) {
      if (!this.isCurrentCapture(generation)) return;
      if (this.analyzingTimer) clearTimeout(this.analyzingTimer);
      this.analyzingTimer = null;
      const isQuota = error instanceof DesktopError
        && (error.code === 'QUOTA_EXHAUSTED' || error.status === 402);
      this.update({
        ...this.state,
        phase: isQuota ? 'quota' : 'error',
        message: isQuota
          ? 'Лимит попыток исчерпан'
          : error instanceof Error
            ? error.message
            : 'Не удалось проанализировать драфт',
      });
    } finally {
      if (generation === this.captureGeneration) {
        this.busy = false;
        if (this.inDraft && !this.sessionCompleted && this.state.phase !== 'quota') {
          this.scheduleCapture();
        }
      }
    }
  }

  private async captureDotaWindow(): Promise<NativeImage | null> {
    const dimensions = screen.getAllDisplays().reduce(
      (largest, display) => ({
        width: Math.max(largest.width, Math.round(display.size.width * display.scaleFactor)),
        height: Math.max(largest.height, Math.round(display.size.height * display.scaleFactor)),
      }),
      { width: 1920, height: 1080 },
    );
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: dimensions,
      fetchWindowIcons: false,
    });
    const source = sources.find((candidate) => {
      const name = candidate.name.toLowerCase();
      return name === 'dota 2' || name.includes('dota 2');
    });
    if (!source || source.thumbnail.isEmpty()) return null;
    return fitForUpload(source.thumbnail);
  }

  private startWindowPolling(): void {
    if (this.processTimer) return;
    this.processTimer = setInterval(() => {
      void this.pollDotaWindow();
    }, 3_000);
  }

  private async pollDotaWindow(): Promise<void> {
    if (!this.state.enabled || this.pollingDotaWindow) return;
    const generation = this.captureGeneration;
    this.pollingDotaWindow = true;
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 1, height: 1 },
        fetchWindowIcons: false,
      });
      if (!this.state.enabled || generation !== this.captureGeneration) return;
      const dotaDetected = sources.some((candidate) => candidate.name.toLowerCase().includes('dota 2'));
      if (dotaDetected !== this.state.dotaDetected) {
        this.update({
          ...this.state,
          dotaDetected,
          message: dotaDetected && !this.inDraft
            ? 'Dota 2 запущена. Ждём этап выбора героев'
            : this.state.message,
        });
      }
    } catch {
      return;
    } finally {
      this.pollingDotaWindow = false;
    }
  }

  private update(state: EngineState): void {
    this.state = structuredClone(state);
    this.emit(this.getState());
  }

  private cancelCapture(): void {
    if (!this.captureTimer) return;
    clearTimeout(this.captureTimer);
    this.captureTimer = null;
  }

  private clearTimers(): void {
    this.cancelCapture();
    if (this.processTimer) clearInterval(this.processTimer);
    if (this.analyzingTimer) clearTimeout(this.analyzingTimer);
    this.processTimer = null;
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
      && !this.sessionCompleted
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
