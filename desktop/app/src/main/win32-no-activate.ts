import { createRequire } from 'node:module';
import type { BrowserWindow } from 'electron';
import log from 'electron-log/main';
import type { LibraryHandle, TypeObject } from 'koffi';

const WM_MOUSEACTIVATE = 0x0021;
const MA_NOACTIVATE = 3;
const SUBCLASS_ID = 0x43504f56;
const requireModule = createRequire(import.meta.url);

type NativeInteger = number | bigint;

type Win32NoActivateApi = {
  library: LibraryHandle;
  callbackType: TypeObject;
  setWindowSubclass: (
    windowHandle: bigint,
    callback: bigint,
    subclassId: number,
    referenceData: number,
  ) => number;
  removeWindowSubclass: (
    windowHandle: bigint,
    callback: bigint,
    subclassId: number,
  ) => number;
  defSubclassProc: (
    windowHandle: bigint | null,
    message: number,
    wParam: NativeInteger,
    lParam: NativeInteger,
  ) => NativeInteger;
};

function nativeHandle(window: BrowserWindow): bigint {
  const handle = window.getNativeWindowHandle();
  return handle.length >= 8
    ? handle.readBigUInt64LE(0)
    : BigInt(handle.readUInt32LE(0));
}

function loadApi(): { api: Win32NoActivateApi; koffi: typeof import('koffi') } | null {
  if (process.platform !== 'win32') return null;
  try {
    const koffi = requireModule('koffi') as typeof import('koffi');
    const library = koffi.load('comctl32.dll');
    const callbackType = koffi.proto(
      '__stdcall',
      'CounterpickOverlaySubclassProc',
      'intptr',
      ['void *', 'uint32', 'uintptr', 'intptr', 'uintptr', 'uintptr'],
    );
    return {
      koffi,
      api: {
        library,
        callbackType,
        setWindowSubclass: library.func(
          '__stdcall',
          'SetWindowSubclass',
          'int',
          ['void *', koffi.pointer(callbackType), 'uintptr', 'uintptr'],
        ) as Win32NoActivateApi['setWindowSubclass'],
        removeWindowSubclass: library.func(
          '__stdcall',
          'RemoveWindowSubclass',
          'int',
          ['void *', koffi.pointer(callbackType), 'uintptr'],
        ) as Win32NoActivateApi['removeWindowSubclass'],
        defSubclassProc: library.func(
          '__stdcall',
          'DefSubclassProc',
          'intptr',
          ['void *', 'uint32', 'uintptr', 'intptr'],
        ) as Win32NoActivateApi['defSubclassProc'],
      },
    };
  } catch (error) {
    log.error('Could not load the Windows no-activate integration', error);
    return null;
  }
}

export class Win32NoActivateOverlay {
  private disposed = false;

  static attach(window: BrowserWindow): Win32NoActivateOverlay | null {
    const loaded = loadApi();
    if (!loaded || window.isDestroyed()) return null;
    const { api, koffi } = loaded;
    let callbackPointer: bigint | null = null;
    let activationLogged = false;
    const callback = (
      windowHandle: bigint | null,
      message: number,
      wParam: NativeInteger,
      lParam: NativeInteger,
    ): NativeInteger => {
      if (message === WM_MOUSEACTIVATE) {
        if (!activationLogged) {
          activationLogged = true;
          setImmediate(() => log.info('Windows overlay mouse activation suppressed'));
        }
        return MA_NOACTIVATE;
      }
      try {
        return api.defSubclassProc(windowHandle, message, wParam, lParam);
      } catch (error) {
        log.error('Windows overlay subclass dispatch failed', error);
        return 0;
      }
    };

    try {
      callbackPointer = koffi.register(callback, koffi.pointer(api.callbackType));
      if (!api.setWindowSubclass(nativeHandle(window), callbackPointer, SUBCLASS_ID, 0)) {
        koffi.unregister(callbackPointer);
        callbackPointer = null;
        api.library.unload();
        log.error('Windows rejected the no-activate overlay subclass');
        return null;
      }
      log.info('Windows no-activate overlay subclass attached');
      return new Win32NoActivateOverlay(window, api, koffi, callbackPointer);
    } catch (error) {
      if (callbackPointer !== null) koffi.unregister(callbackPointer);
      try {
        api.library.unload();
      } catch (unloadError) {
        log.warn('Could not unload the failed Windows no-activate integration', unloadError);
      }
      log.error('Could not attach the Windows no-activate overlay subclass', error);
      return null;
    }
  }

  private constructor(
    private readonly window: BrowserWindow,
    private readonly api: Win32NoActivateApi,
    private readonly koffi: typeof import('koffi'),
    private readonly callbackPointer: bigint,
  ) {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.window.isDestroyed()) {
      try {
        if (!this.api.removeWindowSubclass(
          nativeHandle(this.window),
          this.callbackPointer,
          SUBCLASS_ID,
        )) {
          log.warn('Windows did not remove the no-activate overlay subclass');
          return;
        }
      } catch (error) {
        log.warn('Could not remove the Windows no-activate overlay subclass', error);
        return;
      }
    }
    this.koffi.unregister(this.callbackPointer);
    try {
      this.api.library.unload();
    } catch (error) {
      log.warn('Could not unload the Windows no-activate integration', error);
    }
  }
}
