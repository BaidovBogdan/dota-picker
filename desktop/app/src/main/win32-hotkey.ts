import { createRequire } from 'node:module';
import type { BrowserWindow } from 'electron';
import log from 'electron-log/main';
import type { LibraryHandle } from 'koffi';
import { resolveWin32Accelerator } from './win32-accelerator.js';

const WM_HOTKEY = 0x0312;
const MOD_NOREPEAT = 0x4000;
const FIRST_HOTKEY_ID = 0x4300;
const LAST_HOTKEY_ID = 0x43ff;
const requireModule = createRequire(import.meta.url);

type Win32Api = {
  library: LibraryHandle;
  registerHotKey: (windowHandle: bigint, id: number, modifiers: number, virtualKey: number) => number;
  unregisterHotKey: (windowHandle: bigint, id: number) => number;
};

export type Win32HotkeyRegistration = {
  id: number;
  shortcut: string;
};

export type Win32HotkeyRegistrationResult =
  | { ok: true; registration: Win32HotkeyRegistration }
  | { ok: false; reason: 'unsupported' | 'unavailable' };

function loadApi(): Win32Api | null {
  if (process.platform !== 'win32') return null;
  try {
    const koffi = requireModule('koffi') as typeof import('koffi');
    const library = koffi.load('user32.dll');
    return {
      library,
      registerHotKey: library.func(
        '__stdcall',
        'RegisterHotKey',
        'int',
        ['void *', 'int', 'uint32', 'uint32'],
      ) as Win32Api['registerHotKey'],
      unregisterHotKey: library.func(
        '__stdcall',
        'UnregisterHotKey',
        'int',
        ['void *', 'int'],
      ) as Win32Api['unregisterHotKey'],
    };
  } catch (error) {
    log.error('Could not load the Windows hotkey integration', error);
    return null;
  }
}

function nativeHandle(window: BrowserWindow): bigint {
  const handle = window.getNativeWindowHandle();
  return handle.length >= 8
    ? handle.readBigUInt64LE(0)
    : BigInt(handle.readUInt32LE(0));
}

function messageId(parameter: Buffer): number {
  if (parameter.length < 4) return 0;
  return parameter.readUInt32LE(0);
}

export class Win32HotkeyRegistry {
  private readonly registrations = new Map<number, Win32HotkeyRegistration>();
  private nextId = FIRST_HOTKEY_ID;
  private disposed = false;

  static create(
    window: BrowserWindow,
    onPressed: (registration: Win32HotkeyRegistration) => void,
  ): Win32HotkeyRegistry | null {
    const api = loadApi();
    if (!api || window.isDestroyed()) return null;
    return new Win32HotkeyRegistry(window, api, onPressed);
  }

  private constructor(
    private readonly window: BrowserWindow,
    private readonly api: Win32Api,
    private readonly onPressed: (registration: Win32HotkeyRegistration) => void,
  ) {
    this.window.hookWindowMessage(WM_HOTKEY, this.handleWindowMessage);
  }

  register(shortcut: string): Win32HotkeyRegistrationResult {
    if (this.disposed || this.window.isDestroyed()) {
      return { ok: false, reason: 'unavailable' };
    }
    const resolved = resolveWin32Accelerator(shortcut);
    if (!resolved) return { ok: false, reason: 'unsupported' };
    const id = this.allocateId();
    if (id === null) return { ok: false, reason: 'unavailable' };
    try {
      const registered = this.api.registerHotKey(
        nativeHandle(this.window),
        id,
        resolved.modifiers | MOD_NOREPEAT,
        resolved.virtualKey,
      );
      if (!registered) return { ok: false, reason: 'unavailable' };
    } catch (error) {
      log.error('Could not register the Windows overlay hotkey', error);
      return { ok: false, reason: 'unavailable' };
    }
    const registration = { id, shortcut };
    this.registrations.set(id, registration);
    return { ok: true, registration };
  }

  unregister(registration: Win32HotkeyRegistration): boolean {
    if (this.registrations.get(registration.id) !== registration) return true;
    if (this.window.isDestroyed()) {
      this.registrations.delete(registration.id);
      return true;
    }
    try {
      if (!this.api.unregisterHotKey(nativeHandle(this.window), registration.id)) {
        log.warn('Windows did not unregister the overlay hotkey', registration.id);
        return false;
      }
      this.registrations.delete(registration.id);
      return true;
    } catch (error) {
      log.error('Could not unregister the Windows overlay hotkey', error);
      return false;
    }
  }

  isRegistered(registration: Win32HotkeyRegistration): boolean {
    return !this.disposed
      && !this.window.isDestroyed()
      && this.registrations.get(registration.id) === registration;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const registration of [...this.registrations.values()]) {
      this.unregister(registration);
    }
    if (!this.window.isDestroyed()) this.window.unhookWindowMessage(WM_HOTKEY);
    try {
      this.api.library.unload();
    } catch (error) {
      log.warn('Could not unload the Windows hotkey integration', error);
      return;
    }
  }

  private readonly handleWindowMessage = (wParam: Buffer): void => {
    if (this.disposed) return;
    const id = messageId(wParam);
    const registration = this.registrations.get(id);
    if (!registration) return;
    setImmediate(() => {
      if (!this.disposed && this.registrations.get(id) === registration) {
        this.onPressed(registration);
      }
    });
  };

  private allocateId(): number | null {
    const capacity = LAST_HOTKEY_ID - FIRST_HOTKEY_ID + 1;
    for (let index = 0; index < capacity; index += 1) {
      const id = this.nextId;
      this.nextId = id >= LAST_HOTKEY_ID ? FIRST_HOTKEY_ID : id + 1;
      if (!this.registrations.has(id)) return id;
    }
    return null;
  }
}
