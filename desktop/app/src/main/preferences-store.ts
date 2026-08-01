import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { app } from 'electron';
import {
  preferencesPatchSchema,
  preferencesSchema,
  overlayShortcutSchema,
  type Preferences,
  type PreferencesPatch,
} from '../shared/contracts.js';

const defaults: Preferences = {
  theme: 'system',
  language: 'ru',
  position: 3,
  rank: null,
  startWithWindows: false,
  minimizeToTray: true,
  overlayShortcut: 'PageUp',
  wishlist: [],
  assistantEnabled: false,
  captureConsent: {
    accepted: false,
    acceptedAt: null,
  },
};

export class PreferencesStore {
  private value: Preferences = defaults;
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async get(): Promise<Preferences> {
    await this.mutationQueue;
    await this.ensureLoaded();
    return structuredClone(this.value);
  }

  async update(patch: PreferencesPatch): Promise<Preferences> {
    const parsedPatch = preferencesPatchSchema.parse(patch);
    return this.mutate((current) => ({
      ...current,
      ...parsedPatch,
      captureConsent: parsedPatch.captureConsent
        ? { ...current.captureConsent, ...parsedPatch.captureConsent }
        : current.captureConsent,
      wishlist: parsedPatch.wishlist
        ? [...new Set(parsedPatch.wishlist)]
        : current.wishlist,
    }));
  }

  async setAssistantEnabled(enabled: boolean): Promise<Preferences> {
    return this.update({ assistantEnabled: enabled });
  }

  async setOverlayShortcut(shortcut: string): Promise<Preferences> {
    const overlayShortcut = overlayShortcutSchema.parse(shortcut);
    return this.mutate((current) => ({ ...current, overlayShortcut }));
  }

  private mutate(nextValue: (current: Preferences) => unknown): Promise<Preferences> {
    const operation = this.mutationQueue.then(async () => {
      await this.ensureLoaded();
      const next = preferencesSchema.parse(nextValue(this.value));
      if (isDeepStrictEqual(next, this.value)) return structuredClone(this.value);
      const loginPreferenceChanged = next.startWithWindows !== this.value.startWithWindows;
      await this.persist(next);
      this.value = next;
      if (loginPreferenceChanged) this.applyLoginPreference(next.startWithWindows);
      return structuredClone(next);
    });
    this.mutationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loadPromise ??= this.load().finally(() => {
      this.loadPromise = null;
    });
    await this.loadPromise;
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.value = preferencesSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.value = defaults;
      }
    }
    this.loaded = true;
    this.applyLoginPreference(this.value.startWithWindows);
  }

  private async persist(value: Preferences): Promise<void> {
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await fs.writeFile(temporaryPath, JSON.stringify(value), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.rename(temporaryPath, this.filePath);
  }

  private applyLoginPreference(enabled: boolean): void {
    if (!app.isPackaged) return;
    app.setLoginItemSettings({
      openAtLogin: enabled,
      args: enabled ? ['--background'] : [],
    });
  }
}
