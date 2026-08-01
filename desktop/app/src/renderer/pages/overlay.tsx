import {
  ArrowsClockwiseIcon,
  CrosshairSimpleIcon,
  ShieldCheckIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import type {
  OverlayBridge,
  OverlayPick,
  OverlayRecommendation,
  OverlayState,
  Position,
} from '../../shared/contracts';
import { BrandMark } from '../components/brand-mark';

const emptyState: OverlayState = {
  language: 'ru',
  available: false,
  enabled: false,
  phase: 'off',
  message: 'Подключаем overlay',
  dotaDetected: false,
  draftActive: false,
  position: 3,
  picks: [],
  recommendations: [],
  latestAnalysisId: null,
  analysisPosition: null,
  shortcut: 'PageUp',
  shortcutAvailable: true,
  refreshing: false,
};

const positions: Position[] = [1, 2, 3, 4, 5];
type Language = OverlayState['language'];

function text(language: Language, russian: string, english: string): string {
  return language === 'en' ? english : russian;
}

function confidenceLabel(
  language: Language,
  confidence: OverlayRecommendation['confidence'],
): string {
  const labels: Record<OverlayRecommendation['confidence'], [string, string]> = {
    low: ['Низкая', 'Low'],
    medium: ['Средняя', 'Medium'],
    high: ['Высокая', 'High'],
  };
  return text(language, ...labels[confidence]);
}

const heroAliases: Record<string, string> = {
  anti_mage: 'antimage',
  centaur_warrunner: 'centaur',
  clockwerk: 'rattletrap',
  doom: 'doom_bringer',
  io: 'wisp',
  lifestealer: 'life_stealer',
  magnus: 'magnataur',
  necrophos: 'necrolyte',
  natures_prophet: 'furion',
  outworld_destroyer: 'obsidian_destroyer',
  queen_of_pain: 'queenofpain',
  shadow_fiend: 'nevermore',
  timbersaw: 'shredder',
  treant_protector: 'treant',
  underlord: 'abyssal_underlord',
  vengeful_spirit: 'vengefulspirit',
  windranger: 'windrunner',
  wraith_king: 'skeleton_king',
  zeus: 'zuus',
};

function overlayBridge(): OverlayBridge | null {
  return (globalThis as typeof globalThis & { counterpickOverlay?: OverlayBridge }).counterpickOverlay ?? null;
}

function heroSlug(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return heroAliases[normalized] ?? normalized;
}

function heroImage(name: string): string {
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${heroSlug(name)}.png`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function HeroImage({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  const source = imageUrl ?? heroImage(name);

  useEffect(() => setFailed(false), [source]);

  return (
    <>
      <span className="overlay-hero-fallback" aria-hidden>{initials(name)}</span>
      {!failed ? (
        <img
          src={source}
          alt={name}
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : null}
    </>
  );
}

function DraftRow({
  side,
  picks,
  language,
}: {
  side: 'ally' | 'enemy';
  picks: OverlayPick[];
  language: Language;
}) {
  const ally = side === 'ally';
  const slots = Array.from({ length: 5 }, (_, slot) => picks.find((pick) => pick.slot === slot) ?? null);

  return (
    <div className={`overlay-draft-row overlay-draft-row--${side}`}>
      <div className="overlay-draft-row__label">
        {ally ? <ShieldCheckIcon size={13} weight="fill" /> : <CrosshairSimpleIcon size={13} weight="bold" />}
        <span>
          {ally
            ? text(language, 'Союз', 'Allies')
            : text(language, 'Враги', 'Enemies')}
        </span>
      </div>
      {slots.map((pick, index) => {
        const name = pick?.localizedName ?? pick?.heroName ?? '';
        return (
          <div
            className={`overlay-pick-slot${pick ? ' is-filled' : ' is-empty'}`}
            key={`${side}-${index}`}
            title={pick
              ? `${name} · ${text(language, 'Уверенность', 'Confidence')} ${Math.round(pick.confidence * 100)}%`
              : `${text(language, 'Свободный слот', 'Empty slot')} ${index + 1}`}
          >
            {pick ? <HeroImage name={pick.heroName} imageUrl={pick.imageUrl} /> : <span>{index + 1}</span>}
          </div>
        );
      })}
    </div>
  );
}

function RecommendationCard({
  recommendation,
  index,
  position,
  language,
  available,
}: {
  recommendation: OverlayRecommendation | null;
  index: number;
  position: Position;
  language: Language;
  available: boolean;
}) {
  if (!recommendation) {
    return (
      <div className="overlay-answer-card overlay-answer-card--empty">
        <div className="overlay-answer-card__empty-index">{index + 1}</div>
        <span>
          {available
            ? text(language, 'Ждём расчёт', 'Waiting for results')
            : text(language, 'Недоступно', 'Unavailable')}
        </span>
      </div>
    );
  }

  const confidence = confidenceLabel(language, recommendation.confidence);

  return (
    <div
      className="overlay-answer-card"
      title={`${recommendation.heroName} · ${text(language, 'Позиция', 'Position')} ${position} · ${text(language, 'Уверенность', 'Confidence')}: ${confidence}`}
    >
      <div className="overlay-answer-card__image">
        <HeroImage name={recommendation.heroName} imageUrl={recommendation.imageUrl} />
        <span>{Math.round(recommendation.score)}</span>
      </div>
      <div className="overlay-answer-card__copy">
        <span>{index + 1}</span>
        <div>
          <strong>{recommendation.heroName}</strong>
          <small>
            {text(language, 'Поз.', 'Pos.')} {position} · {confidence}
          </small>
        </div>
      </div>
    </div>
  );
}

function phaseLabel(state: OverlayState): string {
  const language = state.language;
  if (!state.available || !state.enabled) return text(language, 'ВЫКЛ', 'OFF');
  if (state.phase === 'recognizing') return text(language, 'СКАН', 'SCAN');
  if (state.phase === 'analyzing') return text(language, 'РАСЧЁТ', 'CALC');
  if (state.phase === 'ready') return text(language, 'ГОТОВО', 'READY');
  if (state.phase === 'error' || state.phase === 'quota') {
    return text(language, 'ОШИБКА', 'ERROR');
  }
  if (state.draftActive) return text(language, 'ЭФИР', 'LIVE');
  return text(language, 'ЖДЁМ', 'WAIT');
}

type ActionFailure = {
  error: unknown;
  context: 'load' | 'action';
};

function actionFailureMessage(failure: ActionFailure, language: Language): string {
  const fallback = failure.context === 'load'
    ? text(language, 'Не удалось загрузить overlay', 'Could not load the overlay')
    : text(language, 'Действие не выполнено', 'Action could not be completed');
  if (!(failure.error instanceof Error) || !failure.error.message) return fallback;
  const message = failure.error.message.replace(/^\[[A-Z0-9_]+]\s*/, '');
  if (language === 'en' && /[А-ЯЁа-яё]/u.test(message)) return fallback;
  return message;
}

export function OverlayPage() {
  const [state, setState] = useState<OverlayState>(emptyState);
  const [pending, setPending] = useState<'refresh' | Position | null>(null);
  const [actionError, setActionError] = useState<ActionFailure | null>(null);
  const bridge = useMemo(overlayBridge, []);
  const refreshing = state.available && (pending !== null || state.refreshing);
  const visiblePicks = state.available ? state.picks : [];
  const visibleRecommendations = state.available ? state.recommendations : [];
  const allies = visiblePicks.filter((pick) => pick.side === 'ally');
  const enemies = visiblePicks.filter((pick) => pick.side === 'enemy');
  const answers = Array.from(
    { length: 3 },
    (_, index) => visibleRecommendations[index] ?? null,
  );
  const actionErrorText = actionError
    ? actionFailureMessage(actionError, state.language)
    : null;

  useEffect(() => {
    document.documentElement.lang = state.language;
  }, [state.language]);

  useEffect(() => {
    if (!bridge) {
      setState((current) => ({
        ...current,
        message: text(current.language, 'Overlay bridge недоступен', 'Overlay bridge is unavailable'),
      }));
      return;
    }
    let active = true;
    const unsubscribe = bridge.onState((nextState) => {
      if (active) setState(nextState);
    });
    void bridge.getState()
      .then((nextState) => {
        if (active) setState(nextState);
      })
      .catch((error: unknown) => {
        if (active) setActionError({ error, context: 'load' });
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  const runAction = async (
    key: 'refresh' | Position,
    action: (currentBridge: OverlayBridge) => Promise<OverlayState>,
  ) => {
    if (!state.available || !bridge || pending !== null) return;
    setPending(key);
    setActionError(null);
    try {
      setState(await action(bridge));
    } catch (error) {
      setActionError({ error, context: 'action' });
    } finally {
      setPending(null);
    }
  };

  const hide = () => {
    if (bridge) void bridge.hide();
    else globalThis.close();
  };

  return (
    <main className="overlay-stage">
      <section
        className="draft-overlay"
        aria-label={text(
          state.language,
          'Overlay драфта Counterpick',
          'Counterpick live draft overlay',
        )}
      >
        <header className="draft-overlay__header">
          <div className="draft-overlay__brand">
            <BrandMark />
            <strong>COUNTERPICK</strong>
          </div>
          <div
            className={`draft-overlay__status${state.available && state.draftActive ? ' is-live' : ''}`}
          >
            <span className="draft-overlay__live-dot" aria-hidden />
            <span>{phaseLabel(state)}</span>
            <span>{visiblePicks.length}/10</span>
          </div>
          <button
            className="draft-overlay__close"
            type="button"
            aria-label={`${text(state.language, 'Скрыть overlay', 'Hide overlay')} (${state.shortcut})`}
            title={`${text(state.language, 'Скрыть', 'Hide')} · ${state.shortcut}`}
            onClick={hide}
          >
            <XIcon size={14} weight="bold" aria-hidden />
          </button>
        </header>

        <div className="overlay-draft">
          <DraftRow side="ally" picks={allies} language={state.language} />
          <DraftRow side="enemy" picks={enemies} language={state.language} />
        </div>

        <div className="overlay-answers">
          <div className="overlay-answers__heading">
            <div
              className="overlay-answers__status"
              title={actionErrorText ?? state.message}
              role={actionError ? 'alert' : 'status'}
              aria-live={actionError ? 'assertive' : 'polite'}
              aria-atomic="true"
            >
              <strong>
                {visibleRecommendations.length
                  ? text(state.language, 'Три варианта', 'Three options')
                  : text(state.language, 'Статус', 'Status')}
              </strong>
              <span>{actionErrorText ?? state.message}</span>
            </div>
            <div
              className="overlay-position"
              role="group"
              aria-label={text(state.language, 'Ваша позиция', 'Your position')}
            >
              {positions.map((position) => (
                <button
                  className={state.available && state.position === position ? 'is-active' : ''}
                  type="button"
                  key={position}
                  aria-label={`${text(state.language, 'Позиция', 'Position')} ${position}`}
                  aria-pressed={state.available && state.position === position}
                  title={`${text(state.language, 'Играть на позиции', 'Play position')} ${position}`}
                  disabled={!state.available || refreshing}
                  onClick={() => void runAction(position, (currentBridge) => currentBridge.setPosition(position))}
                >
                  {position}
                </button>
              ))}
            </div>
            <button
              className={`overlay-refresh${refreshing ? ' is-spinning' : ''}`}
              type="button"
              aria-label={text(state.language, 'Проверить новые пики', 'Check for new picks')}
              title={!state.available
                ? state.message
                : state.phase === 'quota'
                  ? text(state.language, 'Проверить лимит и повторить', 'Check the limit and retry')
                  : state.draftActive
                    ? text(state.language, 'Проверить новые пики', 'Check for new picks')
                    : text(state.language, 'Доступно во время драфта', 'Available during the draft')}
              disabled={!state.available || !state.draftActive || refreshing}
              onClick={() => void runAction('refresh', (currentBridge) => currentBridge.refresh())}
            >
              <ArrowsClockwiseIcon size={13} weight="bold" aria-hidden />
            </button>
          </div>
          <div className="overlay-answers__grid">
            {answers.map((recommendation, index) => (
              <RecommendationCard
                recommendation={recommendation}
                index={index}
                position={state.position}
                language={state.language}
                available={state.available}
                key={recommendation?.heroId ?? `empty-${index}`}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
