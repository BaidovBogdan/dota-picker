import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { app, dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import log from 'electron-log/main';
import { z } from 'zod';
import {
  externalUrlSchema,
  heroIdSchema,
  idSchema,
  metaQuerySchema,
  otpRequestSchema,
  paginationSchema,
  passwordChangeSchema,
  passwordResetSchema,
  preferencesPatchSchema,
  reviewInputSchema,
  reviewsQuerySchema,
  startupDiagnosticSchema,
  verifiedCredentialsSchema,
  type IpcResult,
  type OverlayShortcutStatus,
  type Preferences,
} from '../shared/contracts.js';
import { IPC } from '../shared/ipc-channels.js';
import type { ApiClient } from './api-client.js';
import type { AssistantEngine } from './assistant-engine.js';
import { DesktopError, normalizeError } from './errors.js';
import type { OverwolfBridge } from './overwolf-bridge.js';
import type { PreferencesStore } from './preferences-store.js';
import { updatePreferences } from './preferences-update.js';
import type { UpdateManager } from './update-manager.js';

const startupLog = log.scope('startup');

type Dependencies = {
  getWindow: () => BrowserWindow | null;
  api: ApiClient;
  engine: AssistantEngine;
  overwolf: OverwolfBridge;
  preferences: PreferencesStore;
  updates: UpdateManager;
  onPreferencesChanged?: (previous: Preferences, current: Preferences) => void | Promise<void>;
  getOverlayShortcut: () => OverlayShortcutStatus;
  setOverlayShortcut: (shortcut: string) => Promise<OverlayShortcutStatus>;
  localLogPath: string;
};

function ensureTrustedSender(event: IpcMainInvokeEvent, window: BrowserWindow | null): void {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new DesktopError('UNTRUSTED_RENDERER', 'Запрос отклонён');
  }
  const senderUrl = new URL(event.senderFrame.url);
  if (app.isPackaged) {
    if (senderUrl.protocol !== 'counterpick:' || senderUrl.host !== 'app') {
      throw new DesktopError('UNTRUSTED_RENDERER', 'Запрос отклонён');
    }
    return;
  }
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  if (developmentUrl && senderUrl.origin !== new URL(developmentUrl).origin) {
    throw new DesktopError('UNTRUSTED_RENDERER', 'Запрос отклонён');
  }
}

function register<T>(
  channel: string,
  schema: z.ZodType<T>,
  getWindow: () => BrowserWindow | null,
  action: (input: T) => Promise<unknown> | unknown,
): void {
  ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<unknown>> => {
    try {
      ensureTrustedSender(event, getWindow());
      const input = schema.parse(args);
      return { ok: true, value: await action(input) };
    } catch (error) {
      return { ok: false, error: normalizeError(error) };
    }
  });
}

export function registerIpc(dependencies: Dependencies): void {
  const none = z.tuple([]);

  register(IPC.sessionBootstrap, none, dependencies.getWindow, async () => {
    return dependencies.api.bootstrap();
  });
  register(IPC.sessionOtp, z.tuple([otpRequestSchema]), dependencies.getWindow, ([input]) =>
    dependencies.api.requestOtp(input));
  register(IPC.sessionLogin, z.tuple([verifiedCredentialsSchema]), dependencies.getWindow, ([input]) =>
    dependencies.api.login(input));
  register(IPC.sessionRegister, z.tuple([verifiedCredentialsSchema]), dependencies.getWindow, ([input]) =>
    dependencies.api.register(input));
  register(IPC.sessionReset, z.tuple([passwordResetSchema]), dependencies.getWindow, ([input]) =>
    dependencies.api.resetPassword(input));
  register(IPC.sessionChange, z.tuple([passwordChangeSchema]), dependencies.getWindow, ([input]) =>
    dependencies.api.changePassword(input));
  register(IPC.sessionLogout, none, dependencies.getWindow, async () => {
    await dependencies.api.logout();
  });
  register(IPC.sessionMe, none, dependencies.getWindow, () => dependencies.api.getMe());
  register(IPC.sessionQuota, none, dependencies.getWindow, () => dependencies.api.getQuota());
  register(IPC.sessionDelete, none, dependencies.getWindow, async () => {
    await dependencies.api.deleteAccount();
  });

  register(IPC.dataHistory, z.tuple([paginationSchema]), dependencies.getWindow, ([input]) =>
    dependencies.api.history(input));
  register(IPC.dataAnalysis, z.tuple([idSchema]), dependencies.getWindow, ([id]) =>
    dependencies.api.analysis(id));
  register(IPC.dataHeroes, none, dependencies.getWindow, () => dependencies.api.heroes());
  register(IPC.dataMeta, z.tuple([metaQuerySchema]), dependencies.getWindow, ([input]) =>
    dependencies.api.meta(input?.rank));
  register(IPC.dataHero, z.tuple([heroIdSchema]), dependencies.getWindow, ([id]) =>
    dependencies.api.hero(id));
  register(IPC.dataReviews, z.tuple([reviewsQuerySchema]), dependencies.getWindow, ([input]) =>
    dependencies.api.reviews(input));
  register(
    IPC.dataReviewUpsert,
    z.tuple([idSchema, reviewInputSchema]),
    dependencies.getWindow,
    ([analysisId, input]) => dependencies.api.upsertReview(analysisId, input),
  );
  register(IPC.dataReviewDelete, z.tuple([idSchema]), dependencies.getWindow, async ([id]) => {
    await dependencies.api.deleteReview(id);
  });

  register(IPC.billingStatus, none, dependencies.getWindow, () => dependencies.api.billingStatus());
  register(IPC.engineGet, none, dependencies.getWindow, () => dependencies.engine.getState());
  register(IPC.engineSet, z.tuple([z.boolean()]), dependencies.getWindow, async ([enabled]) => {
    if (enabled) {
      const preferences = await dependencies.preferences.get();
      const english = preferences.language === 'en';
      if (!dependencies.api.isAuthenticated()) {
        throw new DesktopError(
          'AUTH_REQUIRED',
          english ? 'Sign in to Counterpick' : 'Войдите в Counterpick',
        );
      }
      if (preferences.assistantMode === 'vision' && !preferences.captureConsent.accepted) {
        const window = dependencies.getWindow();
        if (!window) {
          throw new DesktopError(
            'WINDOW_UNAVAILABLE',
            english ? 'The application window is unavailable' : 'Окно приложения недоступно',
          );
        }
        const result = await dialog.showMessageBox(window, {
          type: 'info',
          title: english ? 'Draft Vision access' : 'Доступ Draft Vision',
          message: english
            ? 'Counterpick uses a Dota 2 window frame and local GSI phase, team, and selected-hero signals during hero selection.'
            : 'Counterpick использует кадр окна Dota 2 и локальные GSI-сигналы фазы, команды и выбранного героя во время выбора героев.',
          detail: english
            ? 'A frame is sent to the analysis API when the window image changes substantially so Counterpick can check for new picks; identical frames are not sent. The server processes it in memory, first matching portraits locally and, when confidence is low, may send the extracted draft region to the configured external recognition provider. The source image is not stored. Dota may include Steam IDs, player names, and other fields in the local GSI payload; Counterpick keeps only phase, team, and the local selected hero ID/name. The raw hero ID/name stay in memory and are not sent or stored; only the derived visual-group side and its source label accompany the frame. All other GSI fields are immediately discarded. Game memory is not accessed.'
            : 'Кадр отправляется в API анализа, когда изображение окна существенно изменилось, чтобы Counterpick проверил новые пики; одинаковые кадры не отправляются. Сервер обрабатывает его в памяти, сначала сопоставляет портреты локально, а при низкой уверенности может передать выделенную область драфта настроенному внешнему провайдеру распознавания. Исходник не сохраняется. Dota может включить Steam ID, имена игроков и другие поля в локальный GSI-пакет; Counterpick оставляет только фазу, команду и ID/имя выбранного локальным игроком героя. Исходные ID/имя героя остаются в памяти, не отправляются и не сохраняются; вместе с кадром уходят только вычисленная сторона визуальной группы и метка источника. Остальные поля GSI сразу отбрасываются. Доступ к памяти игры не используется.',
          buttons: english ? ['Allow', 'Cancel'] : ['Разрешить', 'Отмена'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });
        if (result.response !== 0) {
          throw new DesktopError(
            'CAPTURE_CONSENT_REQUIRED',
            english ? 'Window capture was not allowed' : 'Захват окна не разрешён',
          );
        }
        await dependencies.preferences.update({
          captureConsent: {
            accepted: true,
            acceptedAt: new Date().toISOString(),
          },
        });
      }
      if (preferences.assistantMode === 'overwolf' && !preferences.overwolfConsent.accepted) {
        const window = dependencies.getWindow();
        if (!window) {
          throw new DesktopError(
            'WINDOW_UNAVAILABLE',
            english ? 'The application window is unavailable' : 'Окно приложения недоступно',
          );
        }
        const result = await dialog.showMessageBox(window, {
          type: 'info',
          title: 'Overwolf Live',
          message: english
            ? 'Connect the Overwolf Live companion?'
            : 'Подключить companion Overwolf Live?',
          detail: english
            ? 'Overwolf sends exact Dota 2 draft events to Counterpick through an authenticated local connection. Installation and Overwolf terms always require your explicit confirmation.'
            : 'Overwolf передаёт точные события драфта Dota 2 в Counterpick через защищённое локальное соединение. Установка и условия Overwolf всегда требуют вашего явного подтверждения.',
          buttons: english ? ['Allow', 'Cancel'] : ['Разрешить', 'Отмена'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });
        if (result.response !== 0) {
          throw new DesktopError(
            'OVERWOLF_CONSENT_REQUIRED',
            english ? 'Overwolf Live connection was not allowed' : 'Подключение Overwolf Live не разрешено',
          );
        }
        await dependencies.preferences.update({
          overwolfConsent: {
            accepted: true,
            acceptedAt: new Date().toISOString(),
          },
        });
      }
      if (!dependencies.api.isAuthenticated()) {
        throw new DesktopError(
          'AUTH_REQUIRED',
          english ? 'Sign in to Counterpick' : 'Войдите в Counterpick',
        );
      }
    }
    return dependencies.engine.setEnabled(enabled);
  });
  register(IPC.engineRetry, none, dependencies.getWindow, async () => {
    if (!dependencies.api.isAuthenticated()) {
      const preferences = await dependencies.preferences.get();
      throw new DesktopError(
        'AUTH_REQUIRED',
        preferences.language === 'en' ? 'Sign in to Counterpick' : 'Войдите в Counterpick',
      );
    }
    return dependencies.engine.retry();
  });

  register(IPC.preferencesGet, none, dependencies.getWindow, () => dependencies.preferences.get());
  register(
    IPC.preferencesUpdate,
    z.tuple([preferencesPatchSchema]),
    dependencies.getWindow,
    ([input]) => updatePreferences(
      dependencies.preferences,
      input,
      dependencies.onPreferencesChanged,
    ),
  );

  register(
    IPC.shortcutOverlayGet,
    none,
    dependencies.getWindow,
    dependencies.getOverlayShortcut,
  );
  register(
    IPC.shortcutOverlaySet,
    z.tuple([z.string()]),
    dependencies.getWindow,
    ([shortcut]) => dependencies.setOverlayShortcut(shortcut),
  );

  register(IPC.windowMinimize, none, dependencies.getWindow, () => {
    dependencies.getWindow()?.minimize();
  });
  register(IPC.windowMaximize, none, dependencies.getWindow, () => {
    const window = dependencies.getWindow();
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  register(IPC.windowClose, none, dependencies.getWindow, () => {
    dependencies.getWindow()?.close();
  });
  register(IPC.windowIsMaximized, none, dependencies.getWindow, () =>
    dependencies.getWindow()?.isMaximized() ?? false);
  register(IPC.updateGetState, none, dependencies.getWindow, () =>
    dependencies.updates.getState());
  register(IPC.updateCheck, none, dependencies.getWindow, () =>
    dependencies.updates.check());
  register(IPC.updateDownloadAndInstall, none, dependencies.getWindow, () =>
    dependencies.updates.downloadAndInstall());
  register(IPC.overwolfGetState, none, dependencies.getWindow, () =>
    dependencies.overwolf.getState());
  register(IPC.overwolfConnect, none, dependencies.getWindow, async () => {
    const preferences = await dependencies.preferences.get();
    if (!preferences.overwolfConsent.accepted) {
      throw new DesktopError(
        'OVERWOLF_CONSENT_REQUIRED',
        preferences.language === 'en'
          ? 'Allow the Overwolf Live connection first'
          : 'Сначала разрешите подключение Overwolf Live',
      );
    }
    return dependencies.overwolf.connect();
  });
  register(IPC.overwolfOpenInstaller, none, dependencies.getWindow, async () => {
    await dependencies.overwolf.openInstaller();
  });
  register(IPC.appOpenExternal, z.tuple([externalUrlSchema]), dependencies.getWindow, async ([url]) => {
    await shell.openExternal(url);
  });
  register(IPC.appOpenLocalLogs, none, dependencies.getWindow, async () => {
    const directory = dirname(dependencies.localLogPath);
    await fs.mkdir(directory, { recursive: true });
    try {
      await fs.access(dependencies.localLogPath);
      shell.showItemInFolder(dependencies.localLogPath);
    } catch {
      const error = await shell.openPath(directory);
      if (error) throw new DesktopError('LOCAL_LOG_FOLDER_UNAVAILABLE', error);
    }
  });
  register(IPC.appInfo, none, dependencies.getWindow, () => ({
    version: app.getVersion(),
    platform: process.platform,
  }));
  register(
    IPC.appStartupDiagnostic,
    z.tuple([startupDiagnosticSchema]),
    dependencies.getWindow,
    ([diagnostic]) => {
      startupLog.info('Renderer phase completed', {
        ...diagnostic,
        durationMs: Math.round(diagnostic.durationMs * 10) / 10,
      });
    },
  );
}
