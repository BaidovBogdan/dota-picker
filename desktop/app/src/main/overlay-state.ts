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
  available: boolean,
): OverlayRecommendation[] {
  if (!available) return [];
  const analysis = state.latestAnalysis;
  if (
    !analysis
    || analysis.input.position !== preferences.position
    || (analysis.input.rank ?? null) !== preferences.rank
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
  return {
    language: preferences.language,
    available,
    enabled: available,
    phase: state.phase,
    message: statusMessage(state, preferences, authenticated),
    dotaDetected: state.dotaDetected,
    draftActive: state.draftActive,
    position: preferences.position,
    picks: (available ? state.recognition?.recognized ?? [] : [])
      .filter((pick) => (
        (pick.side === 'ally' || pick.side === 'enemy')
        && pick.heroId !== null
        && !pick.needsReview
      ))
      .map((pick) => ({
        side: pick.side as 'ally' | 'enemy',
        slot: pick.slot,
        heroId: pick.heroId,
        heroName: pick.heroName,
        localizedName: pick.localizedName,
        imageUrl: pick.heroId ? heroImages.get(pick.heroId) ?? null : null,
        confidence: pick.confidence,
      }))
      .sort((left, right) => left.side.localeCompare(right.side) || left.slot - right.slot),
    recommendations: recommendations(state, preferences, available),
    latestAnalysisId: available ? state.latestAnalysisId : null,
    analysisPosition: available ? state.latestAnalysis?.input.position ?? null : null,
    shortcut: shortcut.shortcut,
    shortcutAvailable: shortcut.available,
    refreshing: state.refreshPending || state.phase === 'recognizing' || state.phase === 'analyzing',
  };
}
