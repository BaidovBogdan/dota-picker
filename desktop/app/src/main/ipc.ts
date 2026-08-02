import { app, dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
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
  verifiedCredentialsSchema,
  type IpcResult,
  type OverlayShortcutStatus,
  type Preferences,
} from '../shared/contracts.js';
import { IPC } from '../shared/ipc-channels.js';
import type { ApiClient } from './api-client.js';
import type { DraftEngine } from './draft-engine.js';
import { DesktopError, normalizeError } from './errors.js';
import type { PreferencesStore } from './preferences-store.js';
import type { UpdateManager } from './update-manager.js';

type Dependencies = {
  getWindow: () => BrowserWindow | null;
  api: ApiClient;
  engine: DraftEngine;
  preferences: PreferencesStore;
  updates: UpdateManager;
  onPreferencesChanged?: (previous: Preferences, current: Preferences) => void | Promise<void>;
  getOverlayShortcut: () => OverlayShortcutStatus;
  setOverlayShortcut: (shortcut: string) => Promise<OverlayShortcutStatus>;
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
      if (!preferences.captureConsent.accepted) {
        const window = dependencies.getWindow();
        if (!window) {
          throw new DesktopError(
            'WINDOW_UNAVAILABLE',
            english ? 'The application window is unavailable' : 'Окно приложения недоступно',
          );
        }
        const result = await dialog.showMessageBox(window, {
          type: 'info',
          title: english ? 'Dota 2 window access' : 'Доступ к окну Dota 2',
          message: english
            ? 'Counterpick will locally capture only the Dota 2 window during hero selection.'
            : 'Counterpick будет локально снимать только окно Dota 2 во время выбора героев.',
          detail: english
            ? 'A frame is sent to the analysis server only when the draft changes. Game memory is never read.'
            : 'Кадр отправляется на сервер анализа только при изменении драфта. Чтение памяти игры не используется.',
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
    async ([input]) => {
      const previous = await dependencies.preferences.get();
      const preferences = await dependencies.preferences.update(input);
      await dependencies.onPreferencesChanged?.(previous, preferences);
      return preferences;
    },
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
  register(IPC.appOpenExternal, z.tuple([externalUrlSchema]), dependencies.getWindow, async ([url]) => {
    await shell.openExternal(url);
  });
  register(IPC.appInfo, none, dependencies.getWindow, () => ({
    version: app.getVersion(),
    platform: process.platform,
  }));
}
