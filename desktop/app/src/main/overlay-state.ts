import type {
  EngineState,
  OverlayRecommendation,
  OverlayShortcutStatus,
  OverlayState,
  Preferences,
} from '../shared/contracts.js';

function statusMessage(
  state: EngineState,
  preferences: Preferences,
  authenticated: boolean,
): string {
  const english = preferences.language === 'en';
  if (!authenticated) return english ? 'Sign in to Counterpick' : 'Войдите в Counterpick';
  if (!state.enabled || !preferences.assistantEnabled) {
    return english ? 'Turn on the assistant in the app' : 'Включите помощник в приложении';
  }
  if (!english && state.message) return state.message;
  if (!state.dotaDetected) return english ? 'Launch Dota 2' : 'Запустите Dota 2';
  if (!state.draftActive) return english ? 'Waiting for hero selection' : 'Ждём этап выбора героев';
  const phaseMessages: Partial<Record<EngineState['phase'], string>> = {
    starting: 'Starting the assistant',
    waiting_for_dota: 'Waiting for Dota 2',
    watching_draft: 'Watching draft changes',
    recognizing: 'Recognizing selected heroes',
    analyzing: 'Calculating counterpicks',
    ready: 'Counterpicks are ready',
    quota: 'No analysis attempts left',
    error: 'Analysis stopped. Try again',
  };
  return phaseMessages[state.phase] ?? 'Watching the draft';
}

function recommendations(
  state: EngineState,
  preferences: Preferences,
  position: Preferences['position'],
  available: boolean,
): OverlayRecommendation[] {
  if (!available) return [];
  const analysis = state.latestAnalysis;
  const revalidating = state.draftActive && (
    state.refreshPending
    || state.phase === 'recognizing'
    || state.phase === 'analyzing'
  );
  if (
    !analysis
    || (analysis.input.rank ?? null) !== preferences.rank
    || (!revalidating && analysis.input.position !== position)
  ) {
    return [];
  }
  return analysis.result.recommendations.slice(0, 3).map((recommendation) => ({
    heroId: recommendation.hero.id,
    heroName: recommendation.hero.localizedName ?? recommendation.hero.name,
    imageUrl: recommendation.hero.imageUrl ?? null,
    score: recommendation.score,
    confidence: recommendation.confidence,
  }));
}

export function createOverlayState(
  state: EngineState,
  preferences: Preferences,
  shortcut: OverlayShortcutStatus,
  heroImages: ReadonlyMap<number, string>,
  authenticated: boolean,
): OverlayState {
  const available = authenticated && preferences.assistantEnabled && state.enabled;
  const position = state.recognition?.detectedPosition ?? preferences.position;
  const orientation = state.draftOrientation ?? null;
  const recognized = available ? state.recognition?.recognized ?? [] : [];
  const orientationRequired = Boolean(
    available
    && preferences.assistantMode === 'vision'
    && state.draftActive
    && !orientation
    && recognized.some((pick) => (
      pick.side === 'unknown'
      && pick.visualGroup !== undefined
      && pick.heroId !== null
    )),
  );
  return {
    language: preferences.language,
    available,
    enabled: available,
    phase: state.phase,
    message: statusMessage(state, preferences, authenticated),
    dotaDetected: state.dotaDetected,
    draftActive: state.draftActive,
    position,
    positionSource: state.recognition?.detectedPosition ? 'detected' : 'manual',
    picks: recognized
      .flatMap((pick) => {
        const side = pick.side === 'ally' || pick.side === 'enemy'
          ? !pick.needsReview ? pick.side : null
          : null;
        if (!side || pick.heroId === null) return [];
        return [{
          side,
          slot: pick.slot,
          heroId: pick.heroId,
          heroName: pick.heroName,
          localizedName: pick.localizedName,
          imageUrl: heroImages.get(pick.heroId) ?? null,
          confidence: pick.confidence,
        }];
      })
      .sort((left, right) => left.side.localeCompare(right.side) || left.slot - right.slot),
    recommendations: recommendations(state, preferences, position, available),
    latestAnalysisId: available ? state.latestAnalysisId : null,
    analysisPosition: available ? state.latestAnalysis?.input.position ?? null : null,
    shortcut: shortcut.shortcut,
    shortcutAvailable: shortcut.available,
    refreshing: state.refreshPending || state.phase === 'recognizing' || state.phase === 'analyzing',
    draftOrientation: {
      required: orientationRequired,
      allyGroup: orientation?.allyGroup ?? null,
      source: preferences.assistantMode === 'overwolf'
        ? 'overwolf'
        : orientation?.source ?? null,
    },
  };
}
