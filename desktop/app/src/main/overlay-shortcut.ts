import { globalShortcut } from 'electron';
import {
  normalizeOverlayShortcut,
  overlayShortcutSchema,
  type OverlayShortcutStatus,
} from '../shared/contracts.js';
import { DesktopError } from './errors.js';

export class OverlayShortcutManager {
  private configuredShortcut = 'PageUp';
  private registeredShortcut: string | null = null;
  private readonly pendingShortcuts = new Set<string>();
  private mutationQueue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(private readonly toggleOverlay: () => void) {}

  initialize(shortcut: string): OverlayShortcutStatus {
    const normalized = this.parse(shortcut);
    this.configuredShortcut = normalized;
    try {
      if (globalShortcut.register(normalized, this.toggleOverlay)) {
        this.registeredShortcut = normalized;
      }
    } catch {
      this.registeredShortcut = null;
    }
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
    if (previous === normalized && globalShortcut.isRegistered(normalized)) {
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

    let registered = false;
    try {
      registered = globalShortcut.register(normalized, this.toggleOverlay);
    } catch {
      throw new DesktopError(
        'INVALID_OVERLAY_SHORTCUT',
        'Это сочетание не поддерживается операционной системой',
        null,
        { shortcut: normalized },
      );
    }
    if (!registered) {
      throw new DesktopError(
        'OVERLAY_SHORTCUT_UNAVAILABLE',
        'Это сочетание уже занято другим приложением или системой',
        null,
        { shortcut: normalized },
      );
    }
    this.pendingShortcuts.add(normalized);

    try {
      await persist(normalized);
    } catch (error) {
      globalShortcut.unregister(normalized);
      this.pendingShortcuts.delete(normalized);
      throw error;
    }

    if (this.disposed) {
      globalShortcut.unregister(normalized);
      this.pendingShortcuts.delete(normalized);
      throw new DesktopError(
        'OVERLAY_SHORTCUT_DISPOSED',
        'Менеджер сочетаний уже остановлен',
      );
    }

    this.registeredShortcut = normalized;
    this.configuredShortcut = normalized;
    this.pendingShortcuts.delete(normalized);
    if (previous && previous !== normalized) globalShortcut.unregister(previous);
    return this.getStatus();
  }

  getStatus(): OverlayShortcutStatus {
    const available = this.registeredShortcut === this.configuredShortcut
      && globalShortcut.isRegistered(this.configuredShortcut);
    if (!available && this.registeredShortcut === this.configuredShortcut) {
      this.registeredShortcut = null;
    }
    return {
      shortcut: this.configuredShortcut,
      available,
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.registeredShortcut) globalShortcut.unregister(this.registeredShortcut);
    for (const shortcut of this.pendingShortcuts) globalShortcut.unregister(shortcut);
    this.pendingShortcuts.clear();
    this.registeredShortcut = null;
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
