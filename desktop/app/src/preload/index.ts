import { contextBridge, ipcRenderer } from 'electron';
import type {
  DesktopBridge,
  EngineState,
  IpcResult,
  OverwolfBridgeState,
  UpdateState,
} from '../shared/contracts.js';
import { IPC } from '../shared/ipc-channels.js';

class BridgeError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details?: unknown;

  constructor(error: { code: string; message: string; status: number | null; details?: unknown }) {
    super(`[${error.code}] ${error.message}`);
    this.name = 'BridgeError';
    this.code = error.code;
    this.status = error.status;
    this.details = error.details;
  }
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = await ipcRenderer.invoke(channel, ...args) as IpcResult<T>;
  if (!result.ok) throw new BridgeError(result.error);
  return result.value;
}

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const bridge: DesktopBridge = {
  session: {
    bootstrap: () => invoke(IPC.sessionBootstrap),
    requestOtp: (input) => invoke(IPC.sessionOtp, input),
    login: (input) => invoke(IPC.sessionLogin, input),
    register: (input) => invoke(IPC.sessionRegister, input),
    reset: (input) => invoke(IPC.sessionReset, input),
    change: (input) => invoke(IPC.sessionChange, input),
    logout: () => invoke(IPC.sessionLogout),
    getMe: () => invoke(IPC.sessionMe),
    getQuota: () => invoke(IPC.sessionQuota),
    deleteAccount: () => invoke(IPC.sessionDelete),
  },
  data: {
    history: (input) => invoke(IPC.dataHistory, input),
    analysis: (id) => invoke(IPC.dataAnalysis, id),
    heroes: () => invoke(IPC.dataHeroes),
    meta: (input) => invoke(IPC.dataMeta, input),
    hero: (id) => invoke(IPC.dataHero, id),
    reviews: (input) => invoke(IPC.dataReviews, input),
    upsertReview: (analysisId, input) => invoke(IPC.dataReviewUpsert, analysisId, input),
    deleteReview: (id) => invoke(IPC.dataReviewDelete, id),
  },
  billing: {
    status: () => invoke(IPC.billingStatus),
  },
  engine: {
    getState: () => invoke(IPC.engineGet),
    setEnabled: (enabled) => invoke(IPC.engineSet, enabled),
    retry: () => invoke(IPC.engineRetry),
    onState: (listener) => subscribe<EngineState>(IPC.engineChanged, listener),
  },
  preferences: {
    get: () => invoke(IPC.preferencesGet),
    update: (input) => invoke(IPC.preferencesUpdate, input),
  },
  shortcuts: {
    getOverlay: () => invoke(IPC.shortcutOverlayGet),
    setOverlay: (shortcut) => invoke(IPC.shortcutOverlaySet, shortcut),
  },
  window: {
    minimize: () => invoke(IPC.windowMinimize),
    maximize: () => invoke(IPC.windowMaximize),
    close: () => invoke(IPC.windowClose),
    isMaximized: () => invoke(IPC.windowIsMaximized),
    onMaximized: (listener) => subscribe<boolean>(IPC.windowMaximizedChanged, listener),
  },
  updates: {
    getState: () => invoke(IPC.updateGetState),
    check: () => invoke(IPC.updateCheck),
    downloadAndInstall: () => invoke(IPC.updateDownloadAndInstall),
    onState: (listener) => subscribe<UpdateState>(IPC.updateChanged, listener),
  },
  overwolf: {
    getState: () => invoke(IPC.overwolfGetState),
    connect: () => invoke(IPC.overwolfConnect),
    openInstaller: () => invoke(IPC.overwolfOpenInstaller),
    onState: (listener) => subscribe<OverwolfBridgeState>(IPC.overwolfChanged, listener),
  },
  app: {
    openExternal: (url) => invoke(IPC.appOpenExternal, url),
    openLocalLogs: () => invoke(IPC.appOpenLocalLogs),
    getInfo: () => invoke(IPC.appInfo),
    reportStartup: (input) => invoke(IPC.appStartupDiagnostic, input),
  },
};

contextBridge.exposeInMainWorld('counterpick', bridge);
