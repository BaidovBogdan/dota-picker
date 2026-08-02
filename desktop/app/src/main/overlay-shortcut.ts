import { globalShortcut, type BrowserWindow } from 'electron';
import {
  normalizeOverlayShortcut,
  overlayShortcutSchema,
  type OverlayShortcutStatus,
} from '../shared/contracts.js';
import { DesktopError } from './errors.js';
import {
  Win32HotkeyRegistry,
  type Win32HotkeyRegistration,
  type Win32HotkeyRegistrationResult,
} from './win32-hotkey.js';

type ShortcutRegistration =
  | { kind: 'win32'; value: Win32HotkeyRegistration }
  | { kind: 'electron'; shortcut: string };

type RegistrationResult =
  | { ok: true; registration: ShortcutRegistration }
  | { ok: false; reason: 'unsupported' | 'unavailable' };

export class OverlayShortcutManager {
  private configuredShortcut = 'PageUp';
  private registeredShortcut: ShortcutRegistration | null = null;
  private readonly pendingShortcuts = new Set<ShortcutRegistration>();
  private readonly win32Registry: Win32HotkeyRegistry | null;
  private mutationQueue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(window: BrowserWindow, private readonly toggleOverlay: () => void) {
    this.win32Registry = process.platform === 'win32'
      ? Win32HotkeyRegistry.create(window, this.handleWin32Shortcut)
      : null;
  }

  private readonly handleShortcut = (): void => {
    if (!this.disposed) this.toggleOverlay();
  };

  private readonly handleWin32Shortcut = (registration: Win32HotkeyRegistration): void => {
    if (
      this.disposed
      || this.registeredShortcut?.kind !== 'win32'
      || this.registeredShortcut.value !== registration
    ) {
      return;
    }
    this.toggleOverlay();
  };

  initialize(shortcut: string): OverlayShortcutStatus {
    const normalized = this.parse(shortcut);
    this.configuredShortcut = normalized;
    const result = this.register(normalized);
    if (result.ok) this.registeredShortcut = result.registration;
    return this.getStatus();
  }

  async replace(
    shortcut: string,
    persist: (normalizedShortcut: string) => Promise<void>,
  ): Promise<OverlayShortcutStatus> {
    const operation = this.mutationQueue.then(() => this.replaceNow(shortcut, persist));
    this.mutationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async replaceNow(
    shortcut: string,
    persist: (normalizedShortcut: string) => Promise<void>,
  ): Promise<OverlayShortcutStatus> {
    if (this.disposed) {
      throw new DesktopError(
        'OVERLAY_SHORTCUT_DISPOSED',
        'Менеджер сочетаний уже остановлен',
      );
    }
    const normalized = this.parse(shortcut);
    const previous = this.registeredShortcut;
    if (previous && this.shortcutOf(previous) === normalized && this.isRegistered(previous)) {
      await persist(normalized);
      if (this.disposed) {
        throw new DesktopError(
          'OVERLAY_SHORTCUT_DISPOSED',
          'Менеджер сочетаний уже остановлен',
        );
      }
      this.configuredShortcut = normalized;
      return this.getStatus();
    }

    const result = this.register(normalized);
    if (!result.ok) {
      if (result.reason === 'unsupported') {
        throw new DesktopError(
          'INVALID_OVERLAY_SHORTCUT',
          'Это сочетание не поддерживается операционной системой',
          null,
          { shortcut: normalized },
        );
      }
      throw new DesktopError(
        'OVERLAY_SHORTCUT_UNAVAILABLE',
        'Это сочетание уже занято другим приложением или системой',
        null,
        { shortcut: normalized },
      );
    }
    const next = result.registration;
    this.pendingShortcuts.add(next);

    try {
      await persist(normalized);
    } catch (error) {
      this.unregister(next);
      this.pendingShortcuts.delete(next);
      throw error;
    }

    if (this.disposed) {
      this.unregister(next);
      this.pendingShortcuts.delete(next);
      throw new DesktopError(
        'OVERLAY_SHORTCUT_DISPOSED',
        'Менеджер сочетаний уже остановлен',
      );
    }

    this.registeredShortcut = next;
    this.configuredShortcut = normalized;
    this.pendingShortcuts.delete(next);
    if (previous && this.shortcutOf(previous) !== normalized) this.unregister(previous);
    return this.getStatus();
  }

  getStatus(): OverlayShortcutStatus {
    const registered = this.registeredShortcut;
    const available = registered !== null
      && this.shortcutOf(registered) === this.configuredShortcut
      && this.isRegistered(registered);
    if (!available && registered && this.shortcutOf(registered) === this.configuredShortcut) {
      this.registeredShortcut = null;
    }
    return {
      shortcut: this.configuredShortcut,
      available,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.registeredShortcut) this.unregister(this.registeredShortcut);
    for (const shortcut of this.pendingShortcuts) this.unregister(shortcut);
    this.pendingShortcuts.clear();
    this.registeredShortcut = null;
    this.win32Registry?.dispose();
  }

  private register(shortcut: string): RegistrationResult {
    if (process.platform === 'win32') {
      const result: Win32HotkeyRegistrationResult = this.win32Registry?.register(shortcut)
        ?? { ok: false, reason: 'unavailable' };
      return result.ok
        ? { ok: true, registration: { kind: 'win32', value: result.registration } }
        : result;
    }
    try {
      if (!globalShortcut.register(shortcut, this.handleShortcut)) {
        return { ok: false, reason: 'unavailable' };
      }
      return { ok: true, registration: { kind: 'electron', shortcut } };
    } catch {
      return { ok: false, reason: 'unsupported' };
    }
  }

  private unregister(registration: ShortcutRegistration): void {
    if (registration.kind === 'win32') {
      this.win32Registry?.unregister(registration.value);
      return;
    }
    globalShortcut.unregister(registration.shortcut);
  }

  private isRegistered(registration: ShortcutRegistration): boolean {
    return registration.kind === 'win32'
      ? this.win32Registry?.isRegistered(registration.value) ?? false
      : globalShortcut.isRegistered(registration.shortcut);
  }

  private shortcutOf(registration: ShortcutRegistration): string {
    return registration.kind === 'win32' ? registration.value.shortcut : registration.shortcut;
  }

  private parse(shortcut: string): string {
    const normalized = normalizeOverlayShortcut(shortcut);
    if (!normalized) {
      throw new DesktopError(
        'INVALID_OVERLAY_SHORTCUT',
        'Введите поддерживаемую клавишу или сочетание клавиш',
        null,
        { shortcut },
      );
    }
    return overlayShortcutSchema.parse(normalized);
  }
}
