import type {
  Preferences,
  PreferencesPatch,
} from '../shared/contracts.js';

type PreferencesWriter = {
  get: () => Promise<Preferences>;
  update: (patch: PreferencesPatch) => Promise<Preferences>;
};

type PreferenceAwareEngine = {
  switchMode: (mode: Preferences['assistantMode']) => Promise<unknown>;
  useManualPositionForCurrentDraft: () => void;
  refresh: (force?: boolean) => Promise<unknown>;
};

export async function applyPreferenceEngineChanges(
  previous: Preferences,
  current: Preferences,
  engine: PreferenceAwareEngine,
): Promise<void> {
  if (previous.assistantMode !== current.assistantMode) {
    await engine.switchMode(current.assistantMode);
  }
  const positionChanged = previous.position !== current.position;
  const analysisInputChanged = positionChanged
    || previous.rank !== current.rank
    || (
      current.assistantMode === 'vision'
      && previous.radiantDraftSide !== current.radiantDraftSide
    );
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
