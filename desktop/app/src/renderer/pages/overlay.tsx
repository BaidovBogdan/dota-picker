import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsLeftRightIcon,
  ArrowsClockwiseIcon,
  CrosshairSimpleIcon,
  ShieldCheckIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

import type {
  OverlayBridge,
  DraftAllyGroup,
  OverlayPick,
  OverlayRecommendation,
  OverlayState,
  Position,
} from '../../shared/contracts';
import { BrandMark } from '../components/brand-mark';

const emptyState: OverlayState = {
  language: 'en',
  available: false,
  enabled: false,
  phase: 'starting',
  message: 'Connecting the overlay',
  dotaDetected: false,
  draftActive: false,
  position: 3,
  positionSource: 'manual',
  picks: [],
  recommendations: [],
  latestAnalysisId: null,
  analysisPosition: null,
  shortcut: 'PageUp',
  shortcutAvailable: true,
  refreshing: false,
  draftOrientation: {
    required: false,
    allyGroup: null,
    source: null,
  },
};

const positions: Position[] = [1, 2, 3, 4, 5];
type Language = OverlayState['language'];
type PendingAction = 'refresh' | Position | DraftAllyGroup | null;

export function isOverlayRefreshVisible(
  engineRefreshing: boolean,
  pending: PendingAction,
): boolean {
  return engineRefreshing || pending === 'refresh';
}

export function isDraftOrientationSelectionPending(pending: PendingAction): boolean {
  return pending === 'left' || pending === 'right';
}

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

function DraftOrientationPrompt({
  language,
  pending,
  onSelect,
}: {
  language: Language;
  pending: boolean;
  onSelect: (allyGroup: DraftAllyGroup) => void;
}) {
  const options = [
    {
      allyGroup: 'left' as const,
      icon: ArrowLeftIcon,
      label: text(language, 'Моя команда слева', 'My team is on the left'),
    },
    {
      allyGroup: 'right' as const,
      icon: ArrowRightIcon,
      label: text(language, 'Моя команда справа', 'My team is on the right'),
    },
  ];
  return (
    <div className="overlay-orientation" role="group" aria-label={text(language, 'Сторона вашей команды', 'Your team side')}>
      <div className="overlay-orientation__copy">
        <strong>{text(language, 'Где ваша команда?', 'Where is your team?')}</strong>
        <span>{text(language, 'Автовыбор продолжит работать в следующих кадрах', 'Auto-detection will keep checking the next frames')}</span>
      </div>
      <div className="overlay-orientation__options">
        {options.map(({ allyGroup, icon: Icon, label }) => (
          <button
            type="button"
            key={allyGroup}
            disabled={pending}
            onClick={() => onSelect(allyGroup)}
          >
            <Icon size={13} weight="bold" aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </div>
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

function phaseLabel(state: OverlayState, refreshing: boolean): string {
  const language = state.language;
  if (state.phase === 'starting') return text(language, 'СВЯЗЬ', 'CONNECT');
  if (!state.available || !state.enabled) return text(language, 'ВЫКЛ', 'OFF');
  if (refreshing) return text(language, 'ОБНОВЛ.', 'SYNC');
  if (state.phase === 'recognizing') return text(language, 'СКАН', 'SCAN');
  if (state.phase === 'analyzing') return text(language, 'РАСЧЁТ', 'CALC');
  if (state.phase === 'ready') return text(language, 'ГОТОВО', 'READY');
  if (state.phase === 'error' || state.phase === 'quota') {
    return text(language, 'ОШИБКА', 'ERROR');
  }
  if (state.draftActive) return text(language, 'ЭФИР', 'LIVE');
  return text(language, 'ЖДЁМ', 'WAIT');
}

function statusHeading(
  state: OverlayState,
  refreshing: boolean,
  failed: boolean,
): string {
  const language = state.language;
  if (failed) return text(language, 'Ошибка действия', 'Action failed');
  if (state.phase === 'starting') return text(language, 'Подключаемся', 'Connecting');
  if (!state.available || !state.enabled) return text(language, 'Оверлей недоступен', 'Overlay unavailable');
  if (refreshing) return text(language, 'Проверяем изменения', 'Checking for changes');
  const labels: Record<OverlayState['phase'], [string, string]> = {
    off: ['Ассистент выключен', 'Assistant is off'],
    starting: ['Подключаемся', 'Connecting'],
    waiting_for_dota: state.dotaDetected
      ? ['Ждём выбора героев', 'Waiting for hero selection']
      : ['Ждём Dota 2', 'Waiting for Dota 2'],
    watching_draft: ['Следим за пиками', 'Watching picks'],
    recognizing: ['Распознаём героев', 'Reading hero picks'],
    analyzing: ['Считаем варианты', 'Calculating options'],
    ready: ['Рекомендации готовы', 'Recommendations ready'],
    quota: ['Лимит исчерпан', 'Limit reached'],
    error: ['Нужна проверка', 'Needs attention'],
  };
  return text(language, ...labels[state.phase]);
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
  const [renderFrame, setRenderFrame] = useState({
    state: emptyState,
    presentationId: null as number | null,
  });
  const [pending, setPending] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState<ActionFailure | null>(null);
  const state = renderFrame.state;
  const bridge = useMemo(overlayBridge, []);
  const actionPending = pending !== null;
  const refreshing = state.available && isOverlayRefreshVisible(state.refreshing, pending);
  const controlsPending = actionPending || state.refreshing;
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
  const stateMessage = actionErrorText ?? (
    state.message.trim()
    || text(state.language, 'Ожидаем обновление состояния', 'Waiting for a status update')
  );
  const positionSourceLabel = state.positionSource === 'detected'
    ? text(state.language, 'АВТО', 'AUTO')
    : text(state.language, 'ВРУЧНУЮ', 'MANUAL');
  const statusTone = actionError || state.phase === 'error' || state.phase === 'quota'
    ? ' is-error'
    : refreshing || state.phase === 'recognizing' || state.phase === 'analyzing'
      ? ' is-busy'
      : state.available && state.draftActive
        ? ' is-live'
        : '';

  useEffect(() => {
    document.documentElement.lang = state.language;
  }, [state.language]);

  useEffect(() => {
    if (!bridge) {
      setRenderFrame((current) => ({
        ...current,
        state: {
          ...current.state,
          message: text(current.state.language, 'Overlay bridge недоступен', 'Overlay bridge is unavailable'),
        },
      }));
      return;
    }
    let active = true;
    let pushReceived = false;
    const unsubscribe = bridge.onState((nextState, presentationId) => {
      if (!active) return;
      pushReceived = true;
      setRenderFrame((current) => ({
        state: nextState,
        presentationId: presentationId ?? current.presentationId,
      }));
    });
    void bridge.getState()
      .then((nextState) => {
        if (active && !pushReceived) {
          setRenderFrame({ state: nextState, presentationId: null });
        }
      })
      .catch((error: unknown) => {
        if (active) setActionError({ error, context: 'load' });
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  useLayoutEffect(() => {
    const { presentationId } = renderFrame;
    if (!bridge || !presentationId) return undefined;
    const visibleSlots = (renderFrame.state.available ? renderFrame.state.picks : []).flatMap((pick) => (
      pick.heroId === null
        ? []
        : [{ slot: pick.slot, side: pick.side, heroId: pick.heroId }]
    ));
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setRenderFrame((current) => (
          current.presentationId === presentationId
            ? { ...current, presentationId: null }
            : current
        ));
        void bridge.presented(presentationId, visibleSlots).catch(() => undefined);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [bridge, renderFrame]);

  const runAction = async (
    key: 'refresh' | Position | DraftAllyGroup,
    action: (currentBridge: OverlayBridge) => Promise<OverlayState>,
  ) => {
    if (!state.available || !bridge || pending !== null) return;
    setPending(key);
    setActionError(null);
    try {
      const nextState = await action(bridge);
      setRenderFrame((current) => ({ ...current, state: nextState }));
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
            className={`draft-overlay__status${statusTone}`}
          >
            <span className="draft-overlay__live-dot" aria-hidden />
            <span>{phaseLabel(state, refreshing)}</span>
            <span>{visiblePicks.length}/10</span>
          </div>
          {state.draftOrientation.allyGroup ? (
            <button
              className="draft-overlay__orientation-swap"
              type="button"
              disabled={!state.available || controlsPending}
              aria-label={text(state.language, 'Поменять стороны команд', 'Swap team sides')}
              title={text(state.language, 'Исправить сторону команды', 'Correct your team side')}
              onClick={() => {
                const allyGroup = state.draftOrientation.allyGroup === 'left' ? 'right' : 'left';
                void runAction(
                  allyGroup,
                  (currentBridge) => currentBridge.setDraftAllyGroup(allyGroup),
                );
              }}
            >
              <ArrowsLeftRightIcon size={14} weight="bold" aria-hidden />
            </button>
          ) : null}
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
          {state.draftOrientation.required ? (
            <DraftOrientationPrompt
              language={state.language}
              pending={isDraftOrientationSelectionPending(pending)}
              onSelect={(allyGroup) => void runAction(
                allyGroup,
                (currentBridge) => currentBridge.setDraftAllyGroup(allyGroup),
              )}
            />
          ) : (
            <>
              <DraftRow side="ally" picks={allies} language={state.language} />
              <DraftRow side="enemy" picks={enemies} language={state.language} />
            </>
          )}
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
              <strong>{statusHeading(state, refreshing, Boolean(actionError))}</strong>
              <span>{stateMessage}</span>
            </div>
            <div
              className="overlay-position"
              role="group"
              aria-label={text(state.language, 'Ваша позиция', 'Your position')}
            >
              <span
                className={`overlay-position__source overlay-position__source--${state.positionSource}`}
                title={state.positionSource === 'detected'
                  ? text(state.language, 'Позиция распознана автоматически', 'Position detected automatically')
                  : text(state.language, 'Используется выбранная вручную позиция', 'Using the manually selected position')}
              >
                {positionSourceLabel} P{state.position}
              </span>
              {positions.map((position) => (
                <button
                  className={state.available && state.position === position ? 'is-active' : ''}
                  type="button"
                  key={position}
                  aria-label={`${text(state.language, 'Позиция', 'Position')} ${position}`}
                  aria-pressed={state.available && state.position === position}
                  title={`${text(state.language, 'Играть на позиции', 'Play position')} ${position}`}
                  disabled={!state.available || controlsPending}
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
              disabled={!state.available || !state.draftActive || controlsPending}
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
                position={state.analysisPosition ?? state.position}
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
