import type {
  Preferences,
  PreferencesPatch,
} from '../shared/contracts.js';

type PreferencesWriter = {
  get: () => Promise<Preferences>;
  update: (patch: PreferencesPatch) => Promise<Preferences>;
};

type PreferenceAwareEngine = {
  switchMode: (
    mode: Preferences['assistantMode'],
    onSuspended?: () => void | Promise<void>,
  ) => Promise<unknown>;
  useManualPositionForCurrentDraft: () => void;
  refresh: (force?: boolean) => Promise<unknown>;
};

export async function applyPreferenceEngineChanges(
  previous: Preferences,
  current: Preferences,
  engine: PreferenceAwareEngine,
  onModeSuspended?: () => void | Promise<void>,
): Promise<void> {
  if (previous.assistantMode !== current.assistantMode) {
    await engine.switchMode(current.assistantMode, onModeSuspended);
  }
  const positionChanged = previous.position !== current.position;
  const analysisInputChanged = positionChanged
    || previous.rank !== current.rank;
  if (!analysisInputChanged) return;
  if (positionChanged) engine.useManualPositionForCurrentDraft();
  await engine.refresh(true);
}

export async function updatePreferences(
  store: PreferencesWriter,
  patch: PreferencesPatch,
  onChanged?: (previous: Preferences, current: Preferences) => void | Promise<void>,
): Promise<Preferences> {
  const previous = await store.get();
  const current = await store.update(patch);
  await onChanged?.(previous, current);
  return store.get();
}
