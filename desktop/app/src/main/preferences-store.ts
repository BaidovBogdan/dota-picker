import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { app } from 'electron';
import {
  preferencesPatchSchema,
  preferencesSchema,
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
    const operation = this.mutationQueue.then(async () => {
      await this.ensureLoaded();
      const next = preferencesSchema.parse({
        ...this.value,
        ...parsedPatch,
        captureConsent: parsedPatch.captureConsent
          ? { ...this.value.captureConsent, ...parsedPatch.captureConsent }
          : this.value.captureConsent,
        wishlist: parsedPatch.wishlist
          ? [...new Set(parsedPatch.wishlist)]
          : this.value.wishlist,
      });
      await this.persist(next);
      this.value = next;
      this.applyLoginPreference(next.startWithWindows);
      return structuredClone(next);
    });
    this.mutationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async setAssistantEnabled(enabled: boolean): Promise<Preferences> {
    return this.update({ assistantEnabled: enabled });
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
