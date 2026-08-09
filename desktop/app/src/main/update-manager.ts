import { app, type BrowserWindow } from 'electron';
import log from 'electron-log/main';
import electronUpdater, { type AppUpdater } from 'electron-updater';
import type { UpdateState } from '../shared/contracts.js';
import { IPC } from '../shared/ipc-channels.js';
import { DesktopError } from './errors.js';

type UpdateInfoLike = {
  version: string;
  releaseName?: string | null;
  releaseNotes?: string | Array<{ note?: string | null }> | null;
};

type ProgressLike = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

type UpdateManagerOptions = {
  getWindow: () => BrowserWindow | null;
  prepareForInstall: () => Promise<void>;
  takeOverForInstall: () => void;
  recoverAfterInstallFailure: () => Promise<void>;
};

const initialCheckDelayMs = 8_000;
const checkIntervalMs = 4 * 60 * 60_000;
const progressPublishIntervalMs = 100;
const installWatchdogMs = 30_000;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    bull: '•',
    copy: '©',
    gt: '>',
    hellip: '…',
    laquo: '«',
    ldquo: '“',
    lt: '<',
    lsquo: '‘',
    mdash: '—',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    raquo: '»',
    rdquo: '”',
    reg: '®',
    rsquo: '’',
    trade: '™',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key: string) => {
    const normalized = key.toLowerCase();
    if (Object.hasOwn(namedEntities, normalized)) return namedEntities[normalized];
    const codePoint = normalized.startsWith('#x')
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    if (
      !Number.isInteger(codePoint)
      || codePoint <= 0
      || codePoint > 0x10ffff
      || (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      return entity;
    }
    return String.fromCodePoint(codePoint);
  });
}

function htmlToPlainText(value: string): string {
  return decodeHtmlEntities(
    value
      .slice(0, 20_000)
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*li(?:\s[^>]*)?>/gi, '• ')
      .replace(/<\/\s*(?:blockquote|div|h[1-6]|li|ol|p|pre|ul)\s*>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function releaseNotesText(value: UpdateInfoLike['releaseNotes']): string | null {
  const raw = Array.isArray(value)
    ? value.map((item) => item.note?.trim()).filter(Boolean).join('\n\n')
    : value?.trim();
  if (!raw) return null;
  const text = htmlToPlainText(raw);
  return text ? text.slice(0, 3_500) : null;
}

export class UpdateManager {
  private readonly updater: AppUpdater;
  private readonly supported = app.isPackaged && process.platform === 'win32';
  private readonly updateLog: ReturnType<typeof log.scope>;
  private state: UpdateState;
  private started = false;
  private initialCheckTimer: NodeJS.Timeout | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private checkPromise: Promise<UpdateState> | null = null;
  private downloadPromise: Promise<UpdateState> | null = null;
  private recoveryPromise: Promise<void> | null = null;
  private installWatchdog: NodeJS.Timeout | null = null;
  private lastProgressPublishedAt = 0;

  constructor(private readonly options: UpdateManagerOptions) {
    const { autoUpdater } = electronUpdater;
    this.updater = autoUpdater;
    this.updateLog = log.scope('updates');
    this.updater.logger = this.updateLog;
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.disableWebInstaller = true;
    this.updater.allowPrerelease = false;
    this.updater.allowDowngrade = false;
    this.state = {
      supported: this.supported,
      status: 'idle',
      currentVersion: app.getVersion(),
      availableVersion: null,
      releaseName: null,
      releaseNotes: null,
      progress: null,
      error: null,
    };
  }

  private readonly handleUpdateAvailable = (info: UpdateInfoLike): void => {
    this.setState({
      status: 'available',
      availableVersion: info.version,
      releaseName: info.releaseName?.trim() || null,
      releaseNotes: releaseNotesText(info.releaseNotes),
      progress: null,
      error: null,
    });
  };

  private readonly handleUpdateNotAvailable = (): void => {
    this.setState({
      status: 'idle',
      availableVersion: null,
      releaseName: null,
      releaseNotes: null,
      progress: null,
      error: null,
    });
  };

  private readonly handleDownloadProgress = (progress: ProgressLike): void => {
    const now = Date.now();
    const percent = clampPercent(progress.percent);
    if (percent < 100 && now - this.lastProgressPublishedAt < progressPublishIntervalMs) return;
    this.lastProgressPublishedAt = now;
    this.setState({
      status: 'downloading',
      progress: {
        percent,
        transferred: Math.max(0, Math.round(progress.transferred)),
        total: Math.max(0, Math.round(progress.total)),
        bytesPerSecond: Math.max(0, Math.round(progress.bytesPerSecond)),
      },
      error: null,
    });
  };

  private readonly handleUpdateDownloaded = (): void => {
    this.setState({
      status: 'downloaded',
      progress: {
        percent: 100,
        transferred: this.state.progress?.total ?? this.state.progress?.transferred ?? 0,
        total: this.state.progress?.total ?? 0,
        bytesPerSecond: 0,
      },
      error: null,
    });
  };

  private readonly handleError = (error: Error): void => {
    this.updateLog.error('Updater error', error);
    if (this.state.status === 'checking') return;
    const installFailed = this.state.status === 'installing';
    const failedDownload = this.state.availableVersion !== null
      && ['downloading', 'downloaded', 'installing', 'error'].includes(this.state.status);
    if (!failedDownload) {
      if (!this.state.availableVersion) {
        this.setState({ status: 'idle', progress: null, error: null });
      }
      return;
    }
    this.clearInstallWatchdog();
    this.setState({
      status: 'error',
      progress: null,
      error: 'The update could not be completed. Check your connection and try again.',
    });
    if (installFailed) this.recoverAfterInstallFailure();
  };

  start(): void {
    if (this.started || !this.supported) return;
    this.started = true;
    this.updater.on('update-available', this.handleUpdateAvailable);
    this.updater.on('update-not-available', this.handleUpdateNotAvailable);
    this.updater.on('download-progress', this.handleDownloadProgress);
    this.updater.on('update-downloaded', this.handleUpdateDownloaded);
    this.updater.on('error', this.handleError);
    this.initialCheckTimer = setTimeout(() => {
      this.initialCheckTimer = null;
      void this.check().catch(() => undefined);
      this.checkInterval = setInterval(() => {
        void this.check().catch(() => undefined);
      }, checkIntervalMs);
    }, initialCheckDelayMs);
  }

  dispose(): void {
    if (this.initialCheckTimer) clearTimeout(this.initialCheckTimer);
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.initialCheckTimer = null;
    this.checkInterval = null;
    this.clearInstallWatchdog();
    if (!this.started) return;
    this.started = false;
    this.updater.removeListener('update-available', this.handleUpdateAvailable);
    this.updater.removeListener('update-not-available', this.handleUpdateNotAvailable);
    this.updater.removeListener('download-progress', this.handleDownloadProgress);
    this.updater.removeListener('update-downloaded', this.handleUpdateDownloaded);
    this.updater.removeListener('error', this.handleError);
  }

  getState(): UpdateState {
    return structuredClone(this.state);
  }

  check(): Promise<UpdateState> {
    if (!this.supported) return Promise.resolve(this.getState());
    if (
      this.downloadPromise
      || this.recoveryPromise
      || ['downloading', 'downloaded', 'installing'].includes(this.state.status)
    ) {
      return Promise.resolve(this.getState());
    }
    if (this.checkPromise) return this.checkPromise;
    this.checkPromise = this.runCheck().finally(() => {
      this.checkPromise = null;
    });
    return this.checkPromise;
  }

  downloadAndInstall(): Promise<UpdateState> {
    if (!this.supported) {
      return Promise.reject(new DesktopError('UPDATE_UNAVAILABLE', 'Updates are unavailable in this build'));
    }
    if (this.downloadPromise) return this.downloadPromise;
    if (!this.state.availableVersion || !['available', 'error'].includes(this.state.status)) {
      return Promise.reject(new DesktopError('UPDATE_NOT_READY', 'No update is ready to download'));
    }
    this.downloadPromise = this.runDownloadAndInstall().finally(() => {
      this.downloadPromise = null;
    });
    return this.downloadPromise;
  }

  private async runCheck(): Promise<UpdateState> {
    const previous = this.getState();
    this.setState({ status: 'checking', error: null });
    try {
      await this.updater.checkForUpdates();
    } catch (error) {
      this.updateLog.warn(
        'Update check failed',
        error instanceof Error ? error : new Error('Update check failed'),
      );
      if (this.state.status === 'checking') {
        this.setState({
          status: previous.availableVersion
            ? previous.status === 'error' ? 'error' : 'available'
            : 'idle',
          availableVersion: previous.availableVersion,
          releaseName: previous.releaseName,
          releaseNotes: previous.releaseNotes,
          progress: previous.progress,
          error: previous.error,
        });
      }
      throw new DesktopError(
        'UPDATE_CHECK_FAILED',
        'Could not check for updates. Check your connection and try again.',
      );
    }
    return this.getState();
  }

  private async runDownloadAndInstall(): Promise<UpdateState> {
    if (this.checkPromise) await this.checkPromise;
    if (this.recoveryPromise) await this.recoveryPromise;
    if (!this.state.availableVersion || !['available', 'error'].includes(this.state.status)) {
      throw new DesktopError('UPDATE_NOT_READY', 'No update is ready to download');
    }
    this.lastProgressPublishedAt = 0;
    this.setState({
      status: 'downloading',
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
      error: null,
    });
    try {
      await this.updater.downloadUpdate();
      await this.options.prepareForInstall();
      this.setState({ status: 'installing', error: null });
      this.installWatchdog = setTimeout(() => {
        this.installWatchdog = null;
        this.handleError(new Error('The installer did not take control of the application'));
      }, installWatchdogMs);
      this.options.takeOverForInstall();
      this.updater.quitAndInstall(true, true);
      return this.getState();
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error('Update download failed'));
      throw new DesktopError(
        'UPDATE_FAILED',
        'The update could not be completed. Check your connection and try again.',
      );
    }
  }

  private clearInstallWatchdog(): void {
    if (!this.installWatchdog) return;
    clearTimeout(this.installWatchdog);
    this.installWatchdog = null;
  }

  private recoverAfterInstallFailure(): void {
    if (this.recoveryPromise) return;
    const recovery = this.options.recoverAfterInstallFailure()
      .catch((error) => {
        this.updateLog.error('Could not recover after an installer failure', error);
      });
    this.recoveryPromise = recovery.finally(() => {
      this.recoveryPromise = null;
    });
  }

  private setState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    const window = this.options.getWindow();
    if (!window || window.isDestroyed() || window.webContents.isDestroyed() || window.webContents.isLoading()) {
      return;
    }
    window.webContents.send(IPC.updateChanged, this.getState());
  }
}
