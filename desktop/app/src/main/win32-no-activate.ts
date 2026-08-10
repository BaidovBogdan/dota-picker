import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, type BrowserWindow } from 'electron';
import log from 'electron-log/main';

interface NoActivateNativeModule {
  attach(windowHandle: Buffer): boolean;
  detach(windowHandle: Buffer): boolean;
}

const requireModule = createRequire(import.meta.url);
let nativeModule: NoActivateNativeModule | null | undefined;

function nativeModulePath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'native', 'counterpick_noactivate.node');
  }

  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../native/noactivate/build/Release/counterpick_noactivate.node',
  );
}

function loadNativeModule(): NoActivateNativeModule | null {
  if (nativeModule !== undefined) return nativeModule;

  try {
    nativeModule = requireModule(nativeModulePath()) as NoActivateNativeModule;
    return nativeModule;
  } catch (error) {
    nativeModule = null;
    log.error('Could not load the native no-activate overlay module', error);
    return null;
  }
}

export function installWindowsNoActivate(window: BrowserWindow): boolean {
  if (process.platform !== 'win32' || window.isDestroyed()) return false;

  const module = loadNativeModule();
  if (!module) return false;

  const attached = module.attach(window.getNativeWindowHandle());
  if (!attached) {
    log.error('Windows rejected the native no-activate overlay handler');
    return false;
  }

  log.info('Windows native no-activate overlay handler attached');
  return true;
}
