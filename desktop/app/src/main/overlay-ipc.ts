import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import {
  draftAllyGroupSchema,
  positionSchema,
  type DraftAllyGroup,
  type IpcResult,
  type OverlayState,
  type Position,
} from '../shared/contracts.js';
import { IPC } from '../shared/ipc-channels.js';
import { DesktopError, normalizeError } from './errors.js';

type OverlayIpcDependencies = {
  getWindow: () => BrowserWindow | null;
  getState: () => Promise<OverlayState>;
  refresh: () => Promise<OverlayState>;
  setPosition: (position: Position) => Promise<OverlayState>;
  setDraftAllyGroup: (allyGroup: DraftAllyGroup) => Promise<OverlayState>;
  hide: () => void;
  presented: (presentationId: number) => void;
};

function ensureTrustedOverlaySender(
  event: IpcMainInvokeEvent,
  window: BrowserWindow | null,
): void {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
    throw new DesktopError('UNTRUSTED_RENDERER', 'Запрос отклонён');
  }
  const senderUrl = new URL(event.senderFrame.url);
  if (senderUrl.hash !== '#/overlay') {
    throw new DesktopError('UNTRUSTED_RENDERER', 'Запрос отклонён');
  }
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  if (developmentUrl) {
    if (senderUrl.origin !== new URL(developmentUrl).origin || senderUrl.pathname !== '/overlay.html') {
      throw new DesktopError('UNTRUSTED_RENDERER', 'Запрос отклонён');
    }
    return;
  }
  if (
    senderUrl.protocol !== 'counterpick:'
    || senderUrl.host !== 'app'
    || senderUrl.pathname !== '/overlay.html'
  ) {
    throw new DesktopError('UNTRUSTED_RENDERER', 'Запрос отклонён');
  }
}

function register<T>(
  channel: string,
  schema: z.ZodType<T>,
  dependencies: OverlayIpcDependencies,
  action: (input: T) => Promise<unknown> | unknown,
): void {
  ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<unknown>> => {
    try {
      ensureTrustedOverlaySender(event, dependencies.getWindow());
      return { ok: true, value: await action(schema.parse(args)) };
    } catch (error) {
      return { ok: false, error: normalizeError(error) };
    }
  });
}

export function registerOverlayIpc(dependencies: OverlayIpcDependencies): void {
  const none = z.tuple([]);
  register(IPC.overlayGetState, none, dependencies, dependencies.getState);
  register(IPC.overlayRefresh, none, dependencies, dependencies.refresh);
  register(
    IPC.overlaySetPosition,
    z.tuple([positionSchema]),
    dependencies,
    ([position]) => dependencies.setPosition(position),
  );
  register(
    IPC.overlaySetDraftAllyGroup,
    z.tuple([draftAllyGroupSchema]),
    dependencies,
    ([allyGroup]) => dependencies.setDraftAllyGroup(allyGroup),
  );
  register(IPC.overlayHide, none, dependencies, () => dependencies.hide());
  register(
    IPC.overlayPresented,
    z.tuple([z.number().int().positive()]),
    dependencies,
    ([presentationId]) => dependencies.presented(presentationId),
  );
}
