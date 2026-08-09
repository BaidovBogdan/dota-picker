import type { AssistantMode, DraftAllyGroup, EngineState } from '../shared/contracts.js';
import type { DraftEngine } from './draft-engine.js';
import type { OverwolfDraftEngine } from './overwolf-draft-engine.js';
import type { PreferencesStore } from './preferences-store.js';

type EngineImplementation = Pick<
  DraftEngine,
  | 'getState'
  | 'restore'
  | 'setEnabled'
  | 'suspend'
  | 'retry'
  | 'refresh'
  | 'useManualPositionForCurrentDraft'
  | 'dispose'
>;
type VisionEngineImplementation = EngineImplementation & Pick<
  DraftEngine,
  'setManualAllyGroupForCurrentDraft'
>;

export class AssistantEngine {
  private readonly preferences: PreferencesStore;
  private readonly vision: VisionEngineImplementation;
  private readonly overwolf: OverwolfDraftEngine;
  private readonly emit: (state: EngineState) => void;
  private activeMode: AssistantMode = 'vision';
  private transitionQueue: Promise<void> = Promise.resolve();

  constructor(
    preferences: PreferencesStore,
    vision: VisionEngineImplementation,
    overwolf: OverwolfDraftEngine,
    emit: (state: EngineState) => void,
  ) {
    this.preferences = preferences;
    this.vision = vision;
    this.overwolf = overwolf;
    this.emit = emit;
  }

  getState(): EngineState {
    return this.active.getState();
  }

  restore(): Promise<void> {
    return this.enqueueTransition(async () => {
      await this.syncMode();
      await this.active.restore();
    });
  }

  setEnabled(enabled: boolean): Promise<EngineState> {
    return this.enqueueTransition(async () => {
      await this.syncMode();
      return this.active.setEnabled(enabled);
    });
  }

  suspend(): Promise<EngineState> {
    return this.enqueueTransition(() => this.active.suspend());
  }

  retry(): Promise<EngineState> {
    return this.enqueueTransition(async () => {
      await this.syncMode();
      return this.active.retry();
    });
  }

  refresh(force = false): Promise<EngineState> {
    return this.enqueueTransition(async () => {
      await this.syncMode();
      return this.active.refresh(force);
    });
  }

  switchMode(mode: AssistantMode): Promise<EngineState> {
    return this.enqueueTransition(async () => {
      if (mode === this.activeMode) return this.getState();
      const previous = this.active;
      const wasEnabled = previous.getState().enabled;
      await previous.suspend();
      this.activeMode = mode;
      const currentPreferences = await this.preferences.get();
      const hasConsent = mode === 'overwolf'
        ? currentPreferences.overwolfConsent.accepted
        : currentPreferences.captureConsent.accepted;
      if (wasEnabled && hasConsent) {
        await this.active.restore();
      } else {
        if (wasEnabled) await this.preferences.setAssistantEnabled(false);
        this.emit(this.active.getState());
      }
      return this.getState();
    });
  }

  useManualPositionForCurrentDraft(): void {
    this.active.useManualPositionForCurrentDraft();
  }

  setManualAllyGroupForCurrentDraft(allyGroup: DraftAllyGroup): Promise<EngineState> {
    return this.enqueueTransition(async () => {
      await this.syncMode();
      if (this.activeMode !== 'vision') return this.getState();
      return this.vision.setManualAllyGroupForCurrentDraft(allyGroup);
    });
  }

  async dispose(): Promise<void> {
    await Promise.all([
      this.vision.dispose(),
      this.overwolf.dispose(),
    ]);
  }

  private get active(): EngineImplementation {
    return this.activeMode === 'overwolf' ? this.overwolf : this.vision;
  }

  private async syncMode(): Promise<void> {
    const preferences = await this.preferences.get();
    if (preferences.assistantMode === this.activeMode) return;
    this.activeMode = preferences.assistantMode;
  }

  private enqueueTransition<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.transitionQueue.then(operation, operation);
    this.transitionQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
