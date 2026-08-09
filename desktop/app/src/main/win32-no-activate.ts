import { createRequire } from 'node:module';
import type { BrowserWindow } from 'electron';
import log from 'electron-log/main';

const GWL_EXSTYLE = -20;
const WS_EX_NOACTIVATE = 0x08000000n;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const styleRefreshFlags = SWP_NOSIZE
  | SWP_NOMOVE
  | SWP_NOZORDER
  | SWP_NOACTIVATE
  | SWP_FRAMECHANGED;
const requireModule = createRequire(import.meta.url);

function nativeHandle(window: BrowserWindow): bigint {
  const handle = window.getNativeWindowHandle();
  return handle.length >= 8
    ? handle.readBigUInt64LE(0)
    : BigInt(handle.readUInt32LE(0));
}

export function applyWindowsNoActivateStyle(window: BrowserWindow): boolean {
  if (process.platform !== 'win32' || window.isDestroyed()) return false;
  try {
    const koffi = requireModule('koffi') as typeof import('koffi');
    const user32 = koffi.load('user32.dll');
    try {
      const getWindowLongPtr = user32.func(
        '__stdcall',
        'GetWindowLongPtrW',
        'intptr',
        ['void *', 'int'],
      ) as (windowHandle: bigint, index: number) => number | bigint;
      const setWindowLongPtr = user32.func(
        '__stdcall',
        'SetWindowLongPtrW',
        'intptr',
        ['void *', 'int', 'intptr'],
      ) as (windowHandle: bigint, index: number, value: bigint) => number | bigint;
      const setWindowPos = user32.func(
        '__stdcall',
        'SetWindowPos',
        'int',
        ['void *', 'void *', 'int', 'int', 'int', 'int', 'uint32'],
      ) as (
        windowHandle: bigint,
        insertAfter: null,
        x: number,
        y: number,
        width: number,
        height: number,
        flags: number,
      ) => number;
      const windowHandle = nativeHandle(window);
      const currentStyle = BigInt(getWindowLongPtr(windowHandle, GWL_EXSTYLE));
      const nextStyle = currentStyle | WS_EX_NOACTIVATE;
      if (nextStyle !== currentStyle) {
        setWindowLongPtr(windowHandle, GWL_EXSTYLE, nextStyle);
      }
      const appliedStyle = BigInt(getWindowLongPtr(windowHandle, GWL_EXSTYLE));
      if ((appliedStyle & WS_EX_NOACTIVATE) === 0n) {
        log.error('Windows rejected the no-activate overlay style');
        return false;
      }
      if (!setWindowPos(windowHandle, null, 0, 0, 0, 0, styleRefreshFlags)) {
        log.error('Windows rejected the no-activate overlay style refresh');
        return false;
      }
      log.info('Windows no-activate overlay style applied');
      return true;
    } finally {
      user32.unload();
    }
  } catch (error) {
    log.error('Could not apply the Windows no-activate overlay style', error);
    return false;
  }
}
