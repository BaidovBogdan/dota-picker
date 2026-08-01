import { contextBridge, ipcRenderer } from 'electron';
import type {
  IpcResult,
  OverlayBridge,
  OverlayState,
} from '../shared/contracts.js';

const IPC = {
  getState: 'overlay:get-state',
  refresh: 'overlay:refresh',
  setPosition: 'overlay:set-position',
  hide: 'overlay:hide',
  changed: 'overlay:changed',
} as const;

class OverlayBridgeError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details?: unknown;

  constructor(error: { code: string; message: string; status: number | null; details?: unknown }) {
    super(`[${error.code}] ${error.message}`);
    this.name = 'OverlayBridgeError';
    this.code = error.code;
    this.status = error.status;
    this.details = error.details;
  }
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = await ipcRenderer.invoke(channel, ...args) as IpcResult<T>;
  if (!result.ok) throw new OverlayBridgeError(result.error);
  return result.value;
}

const bridge: OverlayBridge = {
  getState: () => invoke(IPC.getState),
  refresh: () => invoke(IPC.refresh),
  setPosition: (position) => invoke(IPC.setPosition, position),
  hide: () => invoke(IPC.hide),
  onState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: OverlayState) => listener(state);
    ipcRenderer.on(IPC.changed, handler);
    return () => ipcRenderer.removeListener(IPC.changed, handler);
  },
};

contextBridge.exposeInMainWorld('counterpickOverlay', bridge);
