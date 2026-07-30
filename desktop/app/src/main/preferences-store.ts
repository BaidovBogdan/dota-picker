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

  constructor(private readonly filePath: string) {}

  async get(): Promise<Preferences> {
    if (!this.loaded) await this.load();
    return structuredClone(this.value);
  }

  async update(patch: PreferencesPatch): Promise<Preferences> {
    if (!this.loaded) await this.load();
    const parsedPatch = preferencesPatchSchema.parse(patch);
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
    this.value = next;
    await this.persist();
    this.applyLoginPreference(next.startWithWindows);
    return structuredClone(next);
  }

  async setAssistantEnabled(enabled: boolean): Promise<Preferences> {
    return this.update({ assistantEnabled: enabled });
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

  private async persist(): Promise<void> {
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    await fs.writeFile(temporaryPath, JSON.stringify(this.value), {
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
