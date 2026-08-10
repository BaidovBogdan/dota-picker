import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  net,
  protocol,
  screen,
  session,
  shell,
  Tray,
} from 'electron';
import log from 'electron-log/main';
import { ApiClient } from './api-client.js';
import { AssistantEngine } from './assistant-engine.js';
import { DraftEngine } from './draft-engine.js';
import { DiagnosticsReporter } from './diagnostics.js';
import { DesktopError } from './errors.js';
import { GsiReceiver } from './gsi.js';
import { configureDesktopLogging, desktopLogFileName, isAutomatedTestRuntime } from './local-logger.js';
import { registerIpc } from './ipc.js';
import { registerOverlayIpc } from './overlay-ipc.js';
import { createOverlayState } from './overlay-state.js';
import { OverlayShortcutManager } from './overlay-shortcut.js';
import { overlayWindowPosition } from './overlay-window-position.js';
import { installWindowsNoActivate } from './win32-no-activate.js';
import { normalizeOverwolfBridgePort, OverwolfBridge } from './overwolf-bridge.js';
import { OverwolfDraftEngine } from './overwolf-draft-engine.js';
import { PreferencesStore } from './preferences-store.js';
import { applyPreferenceEngineChanges } from './preferences-update.js';
import { TokenVault } from './token-vault.js';
import { UpdateManager } from './update-manager.js';
import type {
  DraftAllyGroup,
  EngineState,
  OverlayShortcutStatus,
  OverlayState,
  OverlayVisibleSlot,
  Position,
} from '../shared/contracts.js';
import { IPC } from '../shared/ipc-channels.js';

const processStartedAt = performance.now();
const startupLog = log.scope('startup');
const overlayLog = log.scope('overlay');

if (process.platform === 'win32') {
  app.commandLine.appendSwitch('wm-window-animations-disabled');
}

const instanceLock = app.requestSingleInstanceLock();
if (!instanceLock) app.quit();

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'counterpick',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: false,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let engine: AssistantEngine | null = null;
let overwolfBridge: OverwolfBridge | null = null;
let overlayShortcut: OverlayShortcutManager | null = null;
let syncOverlayState: ((shouldPresent?: () => boolean) => Promise<void>) | null = null;
let overlayAvailable = false;
let overlayDesiredVisible = false;
let overlayToggleGeneration = 0;
let shutdownPromise: Promise<void> | null = null;
let shutdownComplete = false;
let normalQuitPending = false;
let updateManager: UpdateManager | null = null;
let resumeEngineAfterFailedUpdate = false;
let diagnosticsReporter: DiagnosticsReporter | null = null;
let diagnosticsStopReason: 'quit' | 'update' | 'crash' = 'quit';

const apiUrl = process.env.MAIN_VITE_API_URL ?? 'https://dota-picker-api.onrender.com/v1';
const overwolfBridgePort = normalizeOverwolfBridgePort(
  process.env.MAIN_VITE_OVERWOLF_BRIDGE_PORT,
);
const overwolfStoreUrl = process.env.MAIN_VITE_OVERWOLF_STORE_URL?.trim() || null;
const overlayPreview = process.env.COUNTERPICK_OVERLAY_PREVIEW === '1';
const overlayAlwaysOnTopLevel = process.platform === 'win32' ? 'screen-saver' : 'floating';

function brandIconPath(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'brand', 'counterpick-icon.png');
  return join(app.getAppPath(), '..', '..', 'client', 'assets', 'brand', 'counterpick-icon.png');
}

function disposeRuntime(): Promise<void> {
  if (shutdownComplete) return Promise.resolve();
  shutdownPromise ??= (async () => {
    await Promise.resolve(engine?.dispose()).catch(() => undefined);
    await Promise.resolve(overwolfBridge?.dispose()).catch(() => undefined);
    await Promise.resolve(diagnosticsReporter?.dispose(diagnosticsStopReason)).catch(() => undefined);
  })().then(() => {
      shutdownComplete = true;
    });
  return shutdownPromise;
}

async function prepareForUpdateInstall(): Promise<void> {
  resumeEngineAfterFailedUpdate = engine?.getState().enabled ?? false;
  await engine?.suspend();
}

function takeOverForUpdateInstall(): void {
  quitting = true;
  diagnosticsStopReason = 'update';
}

async function recoverAfterUpdateInstallFailure(canRestoreEngine: boolean): Promise<void> {
  const shouldRestoreEngine = resumeEngineAfterFailedUpdate && canRestoreEngine;
  resumeEngineAfterFailedUpdate = false;
  quitting = false;
  normalQuitPending = false;
  shutdownPromise = null;
  shutdownComplete = false;
  diagnosticsStopReason = 'quit';
  if (shouldRestoreEngine) await engine?.restore();
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  const state = engine?.getState();
  if (state && !mainWindow.webContents.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send(IPC.engineChanged, state);
  }
}

function hideOverlay(): void {
  overlayDesiredVisible = false;
  overlayToggleGeneration += 1;
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
}

function raiseOverlayWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  window.setAlwaysOnTop(true, overlayAlwaysOnTopLevel);
  if (window.isVisible()) window.moveTop();
}

function createWindow(preferences: PreferencesStore): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    frame: false,
    backgroundColor: '#08090b',
    icon: brandIconPath(),
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: true,
      spellcheck: false,
    },
  });

  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  window.webContents.session.setPermissionCheckHandler(() => false);

  window.on('maximize', () => {
    window.webContents.send(IPC.windowMaximizedChanged, true);
  });
  window.on('unmaximize', () => {
    window.webContents.send(IPC.windowMaximizedChanged, false);
  });
  window.on('close', (event) => {
    if (quitting) return;
    if (['downloading', 'downloaded', 'installing'].includes(updateManager?.getState().status ?? 'idle')) {
      event.preventDefault();
      showWindow();
      return;
    }
    event.preventDefault();
    void preferences.get().then((value) => {
      if (value.minimizeToTray) window.hide();
      else {
        quitting = true;
        app.quit();
      }
    });
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  window.once('ready-to-show', () => {
    if (!process.argv.includes('--background') && !overlayPreview) window.show();
  });

  return window;
}

function createOverlayWindow(): BrowserWindow {
  const width = 452;
  const height = 278;
  const { workArea } = screen.getPrimaryDisplay();
  const position = overlayWindowPosition(workArea, { width, height });
  const window = new BrowserWindow({
    width,
    height,
    x: position.x,
    y: position.y,
    show: false,
    paintWhenInitiallyHidden: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    title: 'Counterpick Draft Overlay',
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/overlay.cjs', import.meta.url)),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: true,
      focusOnNavigation: false,
      spellcheck: false,
    },
  });

  window.setMenuBarVisibility(false);
  installWindowsNoActivate(window);
  raiseOverlayWindow(window);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    window.hide();
  });
  window.on('closed', () => {
    overlayWindow = null;
  });
  window.on('show', () => {
    overlayDesiredVisible = true;
    raiseOverlayWindow(window);
  });
  window.on('hide', () => {
    overlayDesiredVisible = false;
  });
  window.on('focus', () => {
    raiseOverlayWindow(window);
  });
  window.on('blur', () => {
    setImmediate(() => {
      if (overlayDesiredVisible && overlayWindow === window) raiseOverlayWindow(window);
    });
  });

  return window;
}

function toggleOverlay(): void {
  const window = overlayWindow;
  if (!window || window.isDestroyed()) return;
  const shouldShow = !overlayDesiredVisible;
  overlayDesiredVisible = shouldShow;
  const generation = ++overlayToggleGeneration;
  if (!shouldShow) {
    window.hide();
    return;
  }
  const synchronize = syncOverlayState;
  if (!synchronize) {
    overlayDesiredVisible = false;
    showWindow();
    return;
  }
  void synchronize(() => generation === overlayToggleGeneration && overlayDesiredVisible)
    .then(() => {
      if (generation !== overlayToggleGeneration || !overlayDesiredVisible) return;
      const currentWindow = overlayWindow;
      if (!currentWindow || currentWindow.isDestroyed()) return;
      if (overlayAvailable || overlayPreview) {
        raiseOverlayWindow(currentWindow);
        currentWindow.showInactive();
        raiseOverlayWindow(currentWindow);
      }
      else {
        overlayDesiredVisible = false;
        showWindow();
      }
    })
    .catch(() => {
      if (generation !== overlayToggleGeneration) return;
      overlayDesiredVisible = false;
      showWindow();
    });
}

type TrayController = {
  tray: Tray;
  refresh: (state: EngineState) => void;
};

function createTray(
  preferences: PreferencesStore,
  currentEngine: AssistantEngine,
  getOverlayShortcut: () => OverlayShortcutStatus,
  toggleAssistant: () => Promise<void>,
): TrayController {
  const icon = nativeImage.createFromPath(brandIconPath()).resize({ width: 20, height: 20 });
  const nextTray = new Tray(icon);
  let refreshGeneration = 0;
  let lastMenuKey: string | null = null;

  const refreshMenu = (state: EngineState) => {
    const generation = ++refreshGeneration;
    void preferences.get().then((currentPreferences) => {
      if (generation !== refreshGeneration || nextTray.isDestroyed()) return;
      const english = currentPreferences.language === 'en';
      const shortcut = getOverlayShortcut();
      const menuKey = [
        state.enabled,
        currentPreferences.language,
        shortcut.shortcut,
        shortcut.available,
      ].join(':');
      if (menuKey === lastMenuKey) return;
      lastMenuKey = menuKey;
      nextTray.setToolTip(shortcut.available
        ? `Counterpick · Overlay: ${shortcut.shortcut}`
        : `Counterpick · Overlay: ${shortcut.shortcut} ${english ? 'unavailable' : 'недоступен'}`);
      nextTray.setContextMenu(Menu.buildFromTemplate([
        {
          label: english ? 'Open Counterpick' : 'Открыть Counterpick',
          click: showWindow,
        },
        {
          label: state.enabled
            ? english ? 'Turn off assistant' : 'Выключить помощник'
            : english ? 'Turn on assistant' : 'Включить помощник',
          click: () => void toggleAssistant().catch(() => showWindow()),
        },
        {
          label: shortcut.available
            ? `${english ? 'Show / hide overlay' : 'Показать / скрыть overlay'} (${shortcut.shortcut})`
            : `${english ? 'Show / hide overlay' : 'Показать / скрыть overlay'} (${shortcut.shortcut} ${english ? 'unavailable' : 'недоступен'})`,
          click: toggleOverlay,
        },
        { type: 'separator' },
        {
          label: english ? 'Quit' : 'Выход',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]));
    }).catch(() => undefined);
  };

  refreshMenu(currentEngine.getState());
  nextTray.on('click', showWindow);
  nextTray.on('double-click', showWindow);
  return { tray: nextTray, refresh: refreshMenu };
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  const userData = app.getPath('userData');
  configureDesktopLogging(userData, app.isPackaged);
  const localLogPath = join(
    userData,
    'logs',
    desktopLogFileName(app.isPackaged, isAutomatedTestRuntime()),
  );
  startupLog.info('Electron runtime is ready', {
    durationMs: Math.round((performance.now() - processStartedAt) * 10) / 10,
  });
  app.setAppUserModelId('com.counterpick.desktop');

  const rendererRoot = fileURLToPath(new URL('../renderer', import.meta.url));
  protocol.handle('counterpick', (request) => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Not found', { status: 404 });
    const decodedPath = decodeURIComponent(url.pathname);
    const requestedPath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const target = resolve(rendererRoot, requestedPath);
    const relativePath = relative(rendererRoot, target);
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      return new Response('Bad request', { status: 400 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  const preferences = new PreferencesStore(join(userData, 'preferences.json'));
  const tokenVault = new TokenVault(join(userData, 'secure', 'session.bin'));
  const api = new ApiClient(apiUrl, tokenVault, (diagnostic) => {
    startupLog.info('Session bootstrap operation completed', diagnostic);
  });
  const diagnosticsLog = log.scope('diagnostics');
  diagnosticsReporter = new DiagnosticsReporter({
    api,
    queuePath: join(userData, 'diagnostics', 'queue.json'),
    appVersion: app.getVersion(),
    appBuild: `${app.getVersion()}+electron.${process.versions.electron}`,
    platform: process.platform === 'darwin' || process.platform === 'linux'
      ? process.platform
      : 'win32',
    logger: diagnosticsLog,
  });
  await diagnosticsReporter.start(await preferences.get());
  const gsi = new GsiReceiver(join(userData, 'gsi', 'token'));

  mainWindow = createWindow(preferences);
  overlayWindow = createOverlayWindow();
  const overwolfLog = log.scope('overwolf');
  overwolfBridge = new OverwolfBridge({
    port: overwolfBridgePort,
    storeUrl: overwolfStoreUrl,
    openExternal: (url) => shell.openExternal(url),
    onState: (state) => {
      const window = mainWindow;
      if (
        window
        && !window.isDestroyed()
        && !window.webContents.isDestroyed()
        && !window.webContents.isLoading()
      ) {
        window.webContents.send(IPC.overwolfChanged, state);
      }
    },
    logger: overwolfLog,
  });
  const heroImages = new Map<number, string>();
  const heroImagesRetryBaseMs = 15_000;
  const heroImagesRetryMaxMs = 5 * 60_000;
  let heroImagesLoaded = false;
  let heroImagesLoading: Promise<void> | null = null;
  let heroImagesFailures = 0;
  let heroImagesRetryAt = 0;
  let trayController: TrayController | null = null;
  let lastTrayEngineEnabled: boolean | null = null;
  let overlayPresentationSequence = 0;
  let pendingOverlayPresentation: {
    id: number;
    resolve: () => void;
  } | null = null;
  let pendingOverlayDelivery: {
    id: number;
    timeout: NodeJS.Timeout;
    diagnostic: {
      phase: OverlayState['phase'];
      draftActive: boolean;
      pickCount: number;
      orientationRequired: boolean;
      orientationSource: OverlayState['draftOrientation']['source'];
      allyGroup: OverlayState['draftOrientation']['allyGroup'];
    };
    sentSlots: OverlayVisibleSlot[];
    diagnosticKey: string;
    recordDiagnostic: boolean;
  } | null = null;
  let lastOverlayDiagnostic = '';
  let lastOverlayDeliveryFailure = '';
  const getOverlayState = async (): Promise<OverlayState> => {
    if (!engine) throw new Error('Draft engine is unavailable');
    const currentPreferences = await preferences.get();
    const shortcut = overlayShortcut?.getStatus() ?? {
      shortcut: currentPreferences.overlayShortcut,
      available: false,
    };
    const state = createOverlayState(
      engine.getState(),
      currentPreferences,
      shortcut,
      heroImages,
      api.isAuthenticated(),
    );
    overlayAvailable = state.available;
    return state;
  };
  const finishOverlayPresentation = (presentationId: number): void => {
    if (pendingOverlayPresentation?.id !== presentationId) return;
    const resolvePresentation = pendingOverlayPresentation.resolve;
    pendingOverlayPresentation = null;
    const window = overlayWindow;
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.setBackgroundThrottling(true);
    }
    resolvePresentation();
  };
  const recordOverlayDeliveryFailure = (code: string): void => {
    if (quitting || lastOverlayDeliveryFailure === code) return;
    lastOverlayDeliveryFailure = code;
    overlayLog.warn('Overlay delivery failed', { code, recoverable: true });
    diagnosticsReporter?.record({
      type: 'engine_error',
      status: 'error',
      stage: 'engine',
      durationMs: null,
      details: { code, recoverable: true, stage: 'overlay' },
    });
  };
  const cancelPendingOverlayDelivery = (): void => {
    if (!pendingOverlayDelivery) return;
    clearTimeout(pendingOverlayDelivery.timeout);
    const deliveryId = pendingOverlayDelivery.id;
    pendingOverlayDelivery = null;
    finishOverlayPresentation(deliveryId);
  };
  const acknowledgeOverlayPresentation = (
    presentationId: number,
    visibleSlots: OverlayVisibleSlot[],
  ): void => {
    if (pendingOverlayDelivery?.id !== presentationId) return;
    const delivery = pendingOverlayDelivery;
    clearTimeout(delivery.timeout);
    pendingOverlayDelivery = null;
    const window = overlayWindow;
    if (!window || window.isDestroyed() || !window.isVisible()) {
      if (overlayDesiredVisible) recordOverlayDeliveryFailure('OVERLAY_WINDOW_NOT_VISIBLE');
      finishOverlayPresentation(presentationId);
      return;
    }
    lastOverlayDeliveryFailure = '';
    if (delivery.recordDiagnostic) {
      lastOverlayDiagnostic = delivery.diagnosticKey;
      overlayLog.info('Overlay state rendered', {
        ...delivery.diagnostic,
        sentSlots: delivery.sentSlots,
        visibleSlots,
      });
      diagnosticsReporter?.record({
        type: 'overlay_state',
        status: delivery.diagnostic.phase === 'error'
          ? 'error'
          : delivery.diagnostic.phase === 'ready'
            ? 'success'
            : delivery.diagnostic.phase === 'quota'
              ? 'warning'
              : 'info',
        stage: 'overlay',
        durationMs: null,
        details: {
          ...delivery.diagnostic,
          visibleSlots,
        },
      });
    }
    finishOverlayPresentation(presentationId);
  };
  const publishOverlayState = (state: OverlayState, presentationId?: number): boolean => {
    const window = overlayWindow;
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
      recordOverlayDeliveryFailure('OVERLAY_RENDERER_UNAVAILABLE');
      if (presentationId) finishOverlayPresentation(presentationId);
      return false;
    }
    const sentSlots = state.picks.flatMap((pick) => pick.heroId === null ? [] : [{
      slot: pick.slot,
      side: pick.side,
      heroId: pick.heroId,
    }]);
    const diagnostic = {
      phase: state.phase,
      draftActive: state.draftActive,
      pickCount: state.picks.length,
      orientationRequired: state.draftOrientation.required,
      orientationSource: state.draftOrientation.source,
      allyGroup: state.draftOrientation.allyGroup,
    };
    const diagnosticKey = JSON.stringify({ ...diagnostic, sentSlots });
    const recordDiagnostic = presentationId !== undefined || diagnosticKey !== lastOverlayDiagnostic;
    const deliveryId = presentationId ?? (recordDiagnostic ? ++overlayPresentationSequence : undefined);
    if (deliveryId) {
      cancelPendingOverlayDelivery();
      const timeout = setTimeout(() => {
        if (pendingOverlayDelivery?.id !== deliveryId) return;
        pendingOverlayDelivery = null;
        recordOverlayDeliveryFailure('OVERLAY_RENDER_ACK_TIMEOUT');
        finishOverlayPresentation(deliveryId);
      }, presentationId ? 750 : 2_000);
      timeout.unref?.();
      pendingOverlayDelivery = {
        id: deliveryId,
        timeout,
        diagnostic,
        sentSlots,
        diagnosticKey,
        recordDiagnostic,
      };
    }
    try {
      if (deliveryId) window.webContents.send(IPC.overlayChanged, state, deliveryId);
      else window.webContents.send(IPC.overlayChanged, state);
    } catch {
      cancelPendingOverlayDelivery();
      recordOverlayDeliveryFailure('OVERLAY_RENDERER_GONE');
      return false;
    }
    return true;
  };
  const broadcastOverlayState = async (): Promise<void> => {
    publishOverlayState(await getOverlayState());
  };
  const prepareOverlayPresentation = async (
    shouldPresent: () => boolean = () => true,
  ): Promise<void> => {
    const state = await getOverlayState();
    const window = overlayWindow;
    if (
      !window
      || window.isDestroyed()
      || window.webContents.isDestroyed()
      || window.webContents.isLoading()
    ) {
      throw new DesktopError(
        'OVERLAY_RENDERER_UNAVAILABLE',
        'The overlay is not ready to be shown',
      );
    }
    if (!state.available && !overlayPreview) {
      throw new DesktopError('OVERLAY_UNAVAILABLE', 'The overlay has no available state');
    }
    if (!shouldPresent()) return;
    if (pendingOverlayPresentation) {
      cancelPendingOverlayDelivery();
      finishOverlayPresentation(pendingOverlayPresentation.id);
    }
    const presentationId = ++overlayPresentationSequence;
    window.webContents.setBackgroundThrottling(false);
    raiseOverlayWindow(window);
    window.showInactive();
    raiseOverlayWindow(window);
    await new Promise<void>((resolvePresentation) => {
      pendingOverlayPresentation = {
        id: presentationId,
        resolve: resolvePresentation,
      };
      publishOverlayState(state, presentationId);
    });
  };
  const broadcastVisibleOverlayState = (): Promise<void> => {
    const window = overlayWindow;
    if (!overlayPreview && (!window || window.isDestroyed() || !window.isVisible())) {
      return Promise.resolve();
    }
    return broadcastOverlayState();
  };
  syncOverlayState = prepareOverlayPresentation;
  const activeOverlayWindow = overlayWindow;
  activeOverlayWindow.webContents.on('render-process-gone', () => {
    cancelPendingOverlayDelivery();
    recordOverlayDeliveryFailure('OVERLAY_RENDERER_GONE');
  });
  const loadHeroImages = (): Promise<void> => {
    if (heroImagesLoaded || Date.now() < heroImagesRetryAt) return Promise.resolve();
    heroImagesLoading ??= api.heroes()
      .then(({ heroes }) => {
        for (const hero of heroes) {
          if (hero.imageUrl) heroImages.set(hero.id, hero.imageUrl);
        }
        heroImagesLoaded = true;
        heroImagesFailures = 0;
        heroImagesRetryAt = 0;
        void broadcastVisibleOverlayState().catch(() => undefined);
      })
      .catch(() => {
        heroImagesFailures += 1;
        const exponent = Math.min(heroImagesFailures - 1, 5);
        const retryDelay = Math.min(
          heroImagesRetryMaxMs,
          heroImagesRetryBaseMs * 2 ** exponent,
        );
        heroImagesRetryAt = Date.now() + retryDelay;
      })
      .finally(() => {
        heroImagesLoading = null;
      });
    return heroImagesLoading;
  };
  const emitEngine = (state: EngineState) => {
    const window = mainWindow;
    if (
      window
      && !window.isDestroyed()
      && window.isVisible()
      && !window.isMinimized()
      && !window.webContents.isDestroyed()
      && !window.webContents.isLoading()
    ) {
      window.webContents.send(IPC.engineChanged, state);
    }
    if (state.enabled !== lastTrayEngineEnabled) {
      lastTrayEngineEnabled = state.enabled;
      trayController?.refresh(state);
    }
    if (!state.enabled && !overlayPreview) hideOverlay();
    else void broadcastVisibleOverlayState().catch(() => undefined);
    if (state.recognition?.recognized.some((pick) => pick.heroId !== null)) {
      void loadHeroImages();
    }
  };
  const visionEngine = new DraftEngine(api, preferences, gsi, emitEngine, {
    diagnostic: (event) => diagnosticsReporter?.record(event),
  });
  const overwolfEngine = new OverwolfDraftEngine(
    api,
    preferences,
    overwolfBridge,
    emitEngine,
    overwolfLog,
    (event) => diagnosticsReporter?.record(event),
  );
  engine = new AssistantEngine(
    preferences,
    visionEngine,
    overwolfEngine,
    emitEngine,
  );
  const updates = new UpdateManager({
    getWindow: () => mainWindow,
    prepareForInstall: prepareForUpdateInstall,
    takeOverForInstall: takeOverForUpdateInstall,
    recoverAfterInstallFailure: () => recoverAfterUpdateInstallFailure(api.isAuthenticated()),
  });
  updateManager = updates;
  api.setAuthenticationListener(async (authenticated, accountId) => {
    await diagnosticsReporter?.applyAuthenticatedAccount(authenticated ? accountId : null);
    if (!authenticated) {
      overlayAvailable = false;
      if (!overlayPreview) hideOverlay();
      await engine?.suspend();
    } else {
      await engine?.restore();
    }
    await broadcastVisibleOverlayState();
  });
  trayController = createTray(
    preferences,
    engine,
    () => overlayShortcut?.getStatus() ?? { shortcut: 'PageUp', available: false },
    async () => {
      const state = engine?.getState();
      if (!state) return;
      if (state.enabled) {
        await engine?.setEnabled(false);
        return;
      }
      const currentPreferences = await preferences.get();
      const hasConsent = currentPreferences.assistantMode === 'overwolf'
        ? currentPreferences.overwolfConsent.accepted
        : currentPreferences.captureConsent.accepted;
      if (!api.isAuthenticated() || !hasConsent) {
        showWindow();
        return;
      }
      await engine?.setEnabled(true);
    },
  );
  tray = trayController.tray;
  lastTrayEngineEnabled = engine.getState().enabled;
  registerIpc({
    getWindow: () => mainWindow,
    api,
    engine,
    overwolf: overwolfBridge,
    preferences,
    updates,
    localLogPath,
    onPreferencesChanged: async (previous, current) => {
      let diagnosticsAppliedAtModeBoundary = false;
      if (engine) {
        await applyPreferenceEngineChanges(previous, current, engine, async () => {
          diagnosticsAppliedAtModeBoundary = true;
          await diagnosticsReporter?.applyPreferences(previous, current);
        });
      }
      if (!diagnosticsAppliedAtModeBoundary) {
        await diagnosticsReporter?.applyPreferences(previous, current);
      }
      if (engine) trayController?.refresh(engine.getState());
      await broadcastVisibleOverlayState();
    },
    getOverlayShortcut: () => overlayShortcut?.getStatus() ?? {
      shortcut: 'PageUp',
      available: false,
    },
    setOverlayShortcut: async (shortcut) => {
      if (!overlayShortcut) throw new Error('Overlay shortcut is unavailable');
      const status = await overlayShortcut.replace(shortcut, async (normalizedShortcut) => {
        await preferences.setOverlayShortcut(normalizedShortcut);
      });
      if (engine) trayController?.refresh(engine.getState());
      await broadcastVisibleOverlayState();
      return status;
    },
  });
  registerOverlayIpc({
    getWindow: () => overlayWindow,
    getState: getOverlayState,
    refresh: async () => {
      const currentPreferences = await preferences.get();
      if (!api.isAuthenticated()) {
        throw new DesktopError(
          'AUTH_REQUIRED',
          currentPreferences.language === 'en' ? 'Sign in to Counterpick' : 'Войдите в Counterpick',
        );
      }
      if (!currentPreferences.assistantEnabled || !engine?.getState().enabled) {
        throw new DesktopError(
          'ASSISTANT_DISABLED',
          currentPreferences.language === 'en'
            ? 'Turn on the assistant in Counterpick'
            : 'Включите помощник в Counterpick',
        );
      }
      const phase = engine?.getState().phase;
      if (phase === 'error' || phase === 'quota') await engine?.retry();
      else await engine?.refresh(true);
      const state = await getOverlayState();
      publishOverlayState(state);
      return state;
    },
    setPosition: async (position: Position) => {
      const current = await preferences.get();
      if (!api.isAuthenticated()) {
        throw new DesktopError(
          'AUTH_REQUIRED',
          current.language === 'en' ? 'Sign in to Counterpick' : 'Войдите в Counterpick',
        );
      }
      if (!current.assistantEnabled || !engine?.getState().enabled) {
        throw new DesktopError(
          'ASSISTANT_DISABLED',
          current.language === 'en'
            ? 'Turn on the assistant in Counterpick'
            : 'Включите помощник в Counterpick',
        );
      }
      engine?.useManualPositionForCurrentDraft();
      if (current.position !== position) {
        await preferences.update({ position });
      }
      await engine?.refresh(true);
      const state = await getOverlayState();
      publishOverlayState(state);
      return state;
    },
    setDraftAllyGroup: async (allyGroup: DraftAllyGroup) => {
      const current = await preferences.get();
      if (!api.isAuthenticated()) {
        throw new DesktopError(
          'AUTH_REQUIRED',
          current.language === 'en' ? 'Sign in to Counterpick' : 'Войдите в Counterpick',
        );
      }
      if (!current.assistantEnabled || !engine?.getState().enabled) {
        throw new DesktopError(
          'ASSISTANT_DISABLED',
          current.language === 'en'
            ? 'Turn on the assistant in Counterpick'
            : 'Включите помощник в Counterpick',
        );
      }
      if (current.assistantMode !== 'vision') {
        throw new DesktopError(
          'DRAFT_ORIENTATION_NOT_REQUIRED',
          current.language === 'en'
            ? 'Overwolf supplies the team side automatically'
            : 'Overwolf определяет сторону команды автоматически',
        );
      }
      await engine.setManualAllyGroupForCurrentDraft(allyGroup);
      const state = await getOverlayState();
      publishOverlayState(state);
      return state;
    },
    hide: hideOverlay,
    presented: acknowledgeOverlayPresentation,
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadURL('counterpick://app/index.html');
  }
  startupLog.info('Main renderer loaded', {
    durationMs: Math.round((performance.now() - processStartedAt) * 10) / 10,
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    const overlayUrl = new URL('/overlay.html', process.env.ELECTRON_RENDERER_URL);
    overlayUrl.hash = '/overlay';
    await overlayWindow.loadURL(overlayUrl.toString());
  } else {
    await overlayWindow.loadURL('counterpick://app/overlay.html#/overlay');
  }
  overlayShortcut = new OverlayShortcutManager(mainWindow, toggleOverlay);
  overlayShortcut.initialize((await preferences.get()).overlayShortcut);
  trayController.refresh(engine.getState());
  await broadcastOverlayState();
  if (overlayPreview) overlayWindow.showInactive();
  updates.start();

  app.on('activate', showWindow);
  app.on('second-instance', showWindow);
}

app.on('before-quit', (event) => {
  quitting = true;
  if (shutdownComplete) return;
  event.preventDefault();
  if (normalQuitPending) return;
  normalQuitPending = true;
  void disposeRuntime().then(() => app.quit());
});

app.on('will-quit', () => {
  updateManager?.dispose();
  overlayShortcut?.dispose();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) app.quit();
});

if (instanceLock) void bootstrap();
