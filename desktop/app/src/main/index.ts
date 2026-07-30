import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  net,
  protocol,
  session,
  Tray,
} from 'electron';
import { ApiClient } from './api-client.js';
import { DraftEngine } from './draft-engine.js';
import { GsiReceiver } from './gsi.js';
import { registerIpc } from './ipc.js';
import { PreferencesStore } from './preferences-store.js';
import { TokenVault } from './token-vault.js';
import type { EngineState } from '../shared/contracts.js';
import { IPC } from '../shared/ipc-channels.js';

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
let tray: Tray | null = null;
let quitting = false;
let engine: DraftEngine | null = null;

const apiUrl = process.env.MAIN_VITE_API_URL ?? 'https://dota-picker-api.onrender.com/v1';

function brandIconPath(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'brand', 'counterpick-icon.png');
  return join(app.getAppPath(), '..', '..', 'client', 'assets', 'brand', 'counterpick-icon.png');
}

function showWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
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
    event.preventDefault();
    void preferences.get().then((value) => {
      if (value.minimizeToTray) window.hide();
      else {
        quitting = true;
        app.quit();
      }
    });
  });

  window.once('ready-to-show', () => {
    if (!process.argv.includes('--background')) window.show();
  });

  return window;
}

function createTray(preferences: PreferencesStore, currentEngine: DraftEngine): Tray {
  const icon = nativeImage.createFromPath(brandIconPath()).resize({ width: 20, height: 20 });
  const nextTray = new Tray(icon);
  nextTray.setToolTip('Counterpick');

  const refreshMenu = (state: EngineState) => {
    nextTray.setContextMenu(Menu.buildFromTemplate([
      {
        label: 'Открыть Counterpick',
        click: showWindow,
      },
      {
        label: state.enabled ? 'Выключить помощник' : 'Включить помощник',
        click: () => {
          void currentEngine.setEnabled(!state.enabled).catch(() => showWindow());
        },
      },
      { type: 'separator' },
      {
        label: 'Выход',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]));
  };

  refreshMenu(currentEngine.getState());
  nextTray.on('click', showWindow);
  nextTray.on('double-click', showWindow);
  (nextTray as Tray & { refreshMenu?: (state: EngineState) => void }).refreshMenu = refreshMenu;
  void preferences.get();
  return nextTray;
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
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

  const userData = app.getPath('userData');
  const preferences = new PreferencesStore(join(userData, 'preferences.json'));
  const tokenVault = new TokenVault(join(userData, 'secure', 'session.bin'));
  const api = new ApiClient(apiUrl, tokenVault);
  const gsi = new GsiReceiver(join(userData, 'gsi', 'token'));

  mainWindow = createWindow(preferences);
  const emitEngine = (state: EngineState) => {
    mainWindow?.webContents.send(IPC.engineChanged, state);
    (tray as (Tray & { refreshMenu?: (value: EngineState) => void }) | null)?.refreshMenu?.(state);
  };
  engine = new DraftEngine(api, preferences, gsi, emitEngine);
  tray = createTray(preferences, engine);
  registerIpc({
    getWindow: () => mainWindow,
    api,
    engine,
    preferences,
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadURL('counterpick://app/index.html');
  }

  app.on('activate', showWindow);
  app.on('second-instance', showWindow);
}

app.on('before-quit', () => {
  quitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) app.quit();
});

app.on('quit', () => {
  void engine?.dispose();
});

if (instanceLock) void bootstrap();
