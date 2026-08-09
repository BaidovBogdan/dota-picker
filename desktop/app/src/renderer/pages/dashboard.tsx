import * as Switch from '@radix-ui/react-switch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Broadcast,
  CheckCircle,
  Clock,
  CrosshairSimple,
  DownloadSimple,
  Eye,
  Info,
  Lightning,
  Monitor,
  Plug,
  Power,
  Radio,
  ShieldCheck,
  Sword,
  Target,
} from '@phosphor-icons/react';
import { Link, useNavigate } from 'react-router';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';

import { desktop } from '../bridge';
import { AnimatedText } from '../components/animated-text';
import { PositionLabel, RankLabel } from '../components/dota-taxonomy';
import { GameSignalVisual, type GameSignalMode } from '../components/game-signal-visual';
import { phaseCopy, formatRelative, heroName } from '../format';
import { useI18n } from '../i18n';
import { recognitionPickKey, recognitionSideLabel } from '../recognition-presentation';
import { ModalPortal } from '../components/modal-portal';
import { StatusScrub } from '../components/motion';
import { AsyncState, Button, HeroIcon, Panel, TextLink } from '../components/ui';
import { useAppStore } from '../store';
import type { AssistantMode, EngineState, OverwolfBridgeState } from '../types';
import {
  assistantModeOptionA11y,
  focusAssistantModeOption,
  resolveAssistantModeNavigation,
} from '../../shared/assistant-mode-control';
import { activateOverwolfLive } from '../../shared/overwolf-connect-flow';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(focusableSelector)]
    .filter((element) => !element.hasAttribute('hidden'));
}

function useDialogAccessibility(open: boolean, dialogRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const restoreFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const backdrop = dialog.closest<HTMLElement>('.modal-backdrop');
    const hiddenSiblings = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();
    let branch: HTMLElement | null = backdrop;
    while (branch?.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        hiddenSiblings.set(sibling, {
          inert: sibling.hasAttribute('inert'),
          ariaHidden: sibling.getAttribute('aria-hidden'),
        });
        sibling.setAttribute('inert', '');
        sibling.setAttribute('aria-hidden', 'true');
      }
      branch = branch.parentElement;
    }
    const frame = requestAnimationFrame(() => {
      (focusableElements(dialog)[0] ?? dialog).focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      for (const [element, previous] of hiddenSiblings) {
        if (!previous.inert) element.removeAttribute('inert');
        if (previous.ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', previous.ariaHidden);
      }
      restoreFocus?.focus();
    };
  }, [dialogRef, open]);
}

function handleDialogKeyDown(
  event: ReactKeyboardEvent<HTMLElement>,
  pending: boolean,
  close: () => void,
) {
  if (event.key === 'Escape' && !pending) {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = focusableElements(event.currentTarget);
  if (focusable.length === 0) {
    event.preventDefault();
    event.currentTarget.focus();
    return;
  }
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !event.currentTarget.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export function DashboardPage() {
  const account = useAppStore((state) => state.account);
  const engine = useAppStore((state) => state.engine);
  const preferences = useAppStore((state) => state.preferences);
  const setPreferences = useAppStore((state) => state.setPreferences);
  const [consentOpen, setConsentOpen] = useState(false);
  const [overwolfConsentOpen, setOverwolfConsentOpen] = useState(false);
  const consentRef = useRef<HTMLElement>(null);
  const overwolfConsentRef = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { language, locale, text } = useI18n();
  useDialogAccessibility(consentOpen, consentRef);
  useDialogAccessibility(overwolfConsentOpen, overwolfConsentRef);

  const quotaQuery = useQuery({
    queryKey: ['quota'],
    queryFn: desktop.session.quota,
    initialData: account?.quota,
    refetchInterval: 60_000,
  });
  const historyQuery = useQuery({
    queryKey: ['history', 'dashboard'],
    queryFn: () => desktop.data.history({ limit: 6 }),
  });
  const overwolfQuery = useQuery({
    queryKey: ['overwolf-bridge'],
    queryFn: desktop.overwolf.getState,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const toggleMutation = useMutation({
    mutationFn: desktop.engine.setEnabled,
  });
  const retryMutation = useMutation({
    mutationFn: desktop.engine.retry,
  });
  const modeMutation = useMutation({
    mutationFn: (assistantMode: AssistantMode) => desktop.preferences.update({ assistantMode }),
    onSuccess: setPreferences,
  });
  const overwolfConnectMutation = useMutation({
    mutationFn: async (consentAcceptedAt?: string) => activateOverwolfLive({
      consentAcceptedAt,
      updatePreferences: desktop.preferences.update,
      setEnabled: desktop.engine.setEnabled,
      connect: desktop.overwolf.connect,
    }),
    onSuccess: ({ preferences: nextPreferences, bridge }) => {
      setPreferences(nextPreferences);
      queryClient.setQueryData(['overwolf-bridge'], bridge);
      setOverwolfConsentOpen(false);
    },
  });
  const overwolfInstallMutation = useMutation({
    mutationFn: desktop.overwolf.openInstaller,
  });
  const consentMutation = useMutation({
    mutationFn: async () => {
      const nextPreferences = await desktop.preferences.update({
        captureConsent: {
          accepted: true,
          acceptedAt: new Date().toISOString(),
        },
      });
      await desktop.engine.setEnabled(true);
      return nextPreferences;
    },
    onSuccess: (nextPreferences) => {
      setPreferences(nextPreferences);
      setConsentOpen(false);
    },
  });

  const latest = historyQuery.data?.items[0];
  const primaryHero = latest?.result.recommendations[0]?.hero;
  const quota = quotaQuery.data ?? account?.quota;
  const remaining = quota?.remaining ?? 0;
  const limit = quota?.limit ?? 0;
  const quotaRatio = limit > 0 ? Math.min(1, remaining / limit) : 0;
  const currentEngine: EngineState = engine ?? {
    enabled: false,
    phase: 'off',
    message: null,
    latestAnalysisId: null,
    lastSeenAt: null,
    dotaDetected: false,
  };
  const assistantMode = preferences?.assistantMode ?? 'vision';
  const modeInteractionBlocked = modeMutation.isPending || !preferences || !currentEngine.enabled;
  const overwolfState: OverwolfBridgeState = overwolfQuery.data ?? {
    phase: 'stopped',
    configured: false,
    protocolVersion: 1,
    port: null,
    connectedAt: null,
    lastMessageAt: null,
    lastError: null,
    companionVersion: null,
    gameDetected: false,
    draftActive: false,
  };
  const status = phaseCopy(currentEngine.phase, language);
  const engineMessage = currentEngine.message
    && (language !== 'en' || !/[А-Яа-яЁё]/.test(currentEngine.message))
    ? currentEngine.message
    : status.description;
  const quotaExhausted = limit > 0 && remaining <= 0;
  const isEngineTransitioning = toggleMutation.isPending || currentEngine.phase === 'starting';
  const engineIconState = isEngineTransitioning
    ? 'pending'
    : currentEngine.enabled
      ? 'enabled'
      : 'disabled';
  const gameSignalUnavailable = currentEngine.phase === 'error' && !currentEngine.dotaDetected;
  const gameSignalMode: GameSignalMode = !currentEngine.enabled || gameSignalUnavailable
    ? 'off'
    : currentEngine.dotaDetected
      ? 'detected'
      : 'waiting';
  const activePosition = currentEngine.recognition?.detectedPosition ?? preferences?.position ?? 1;
  const gameSignalTitle = gameSignalUnavailable
    ? text('Сигнал недоступен', 'Signal unavailable')
    : gameSignalMode === 'off'
      ? text('Сигнал приостановлен', 'Signal paused')
    : gameSignalMode === 'detected'
      ? text('Dota 2 запущена', 'Dota 2 is running')
      : text('Ожидаем Dota 2', 'Waiting for Dota 2');
  const gameSignalDescription = gameSignalUnavailable
    ? text(
        'Не удалось запустить отслеживание. Повторите попытку в блоке ассистента',
        'Tracking could not start. Try again from the assistant panel',
      )
    : gameSignalMode === 'off'
      ? text(
          assistantMode === 'overwolf'
            ? 'Включите ассистента, чтобы получать точные события драфта'
            : 'Включите ассистента, чтобы начать отслеживание окна игры',
          assistantMode === 'overwolf'
            ? 'Turn on the assistant to receive exact draft events'
            : 'Turn on the assistant to start watching for the game window',
        )
    : gameSignalMode === 'detected'
      ? text(
          'Окно игры обнаружено. Ожидаем выбор героев',
          'Game window detected. Waiting for hero selection',
        )
      : text(
          'Запустите игру — повторно включать ассистента не нужно',
          'Launch the game — you do not need to enable the assistant again',
        );
  const overwolfPhaseCopy = (() => {
    switch (overwolfState.phase) {
      case 'connected':
        return text('Подключён', 'Connected');
      case 'pairing':
        return text('Открываем companion', 'Opening companion');
      case 'listening':
        return text('Готов к подключению', 'Ready to connect');
      case 'stale':
        return text('Переподключаемся', 'Reconnecting');
      case 'error':
        return text('Нужна проверка', 'Needs attention');
      default:
        return text('Не подключён', 'Not connected');
    }
  })();
  const gameSignalCopy = (
    <>
      <strong>
        <AnimatedText
          text={gameSignalTitle}
          reserveLines={1}
          live="polite"
        />
      </strong>
      <p>
        <AnimatedText
          text={gameSignalDescription}
          reserveLines={2}
        />
      </p>
    </>
  );

  useEffect(() => desktop.overwolf.subscribe((state) => {
    queryClient.setQueryData(['overwolf-bridge'], state);
  }), [queryClient]);

  const onToggle = (enabled: boolean) => {
    if (quotaExhausted && enabled) {
      navigate('/profile?section=plan');
      return;
    }
    if (
      enabled
      && assistantMode === 'vision'
      && !preferences?.captureConsent.accepted
    ) {
      setConsentOpen(true);
      return;
    }
    if (
      enabled
      && assistantMode === 'overwolf'
      && !preferences?.overwolfConsent.accepted
    ) {
      setOverwolfConsentOpen(true);
      return;
    }
    toggleMutation.mutate(enabled);
  };

  const selectAssistantMode = (mode: AssistantMode) => {
    if (mode === assistantMode || modeInteractionBlocked) return;
    modeMutation.mutate(mode, {
      onSuccess: () => {
        if (mode === 'overwolf' && currentEngine.enabled && !preferences?.overwolfConsent.accepted) {
          setOverwolfConsentOpen(true);
        }
      },
    });
  };

  const handleModeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const nextMode = resolveAssistantModeNavigation(event.key);
    if (!nextMode) return;
    event.preventDefault();
    if (modeInteractionBlocked) return;
    focusAssistantModeOption(event.currentTarget.parentElement, nextMode);
    selectAssistantMode(nextMode);
  };

  const connectOverwolf = () => {
    if (!preferences?.overwolfConsent.accepted) {
      setOverwolfConsentOpen(true);
      return;
    }
    overwolfConnectMutation.mutate(undefined);
  };

  if (quotaQuery.isError && historyQuery.isError) {
    return (
      <PageFallback
        onRetry={() => {
          void quotaQuery.refetch();
          void historyQuery.refetch();
        }}
      />
    );
  }

  return (
    <main className="page dashboard-page" id="main-content">
      <header className="page-header dashboard-heading" data-reveal>
        <div className="dashboard-heading__title">
          <span className="dashboard-heading__date">
            <Sword size={17} weight="duotone" aria-hidden />
            {new Intl.DateTimeFormat(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(new Date())}
          </span>
          <h1>{text('Автоконтрпик', 'Auto Counterpick')}</h1>
          <p>
            {text(
              'Следит за стадией выбора героев и показывает расчёт, когда данных достаточно.',
              'Tracks hero selection and shows recommendations as soon as there is enough data.',
            )}
          </p>
        </div>
      </header>

      <div className="dashboard-grid">
        <Panel className={`controller-card controller-card--${currentEngine.phase}`} data-reveal>
          <div className="controller-card__ambient" aria-hidden />
          <div className="controller-card__header">
            <div className="controller-card__identity">
              <CrosshairSimple size={19} weight="duotone" aria-hidden />
              <span>{text('Ассистент драфта', 'Draft assistant')}</span>
            </div>
            <div className={`controller-card__status controller-card__status--${currentEngine.phase}`}>
              <span className="status-dot" />
              <StatusScrub text={status.title} />
            </div>
            <span className="controller-card__local">
              <ShieldCheck size={17} weight="duotone" aria-hidden />
              {assistantMode === 'overwolf'
                ? text('Точные события, локальный канал', 'Exact events, local channel')
                : text('Кадр + локальный GSI', 'Frame + local GSI')}
            </span>
          </div>
          <div className="controller-card__content">
            <div className="controller-card__brief">
              <h2>
                <AnimatedText
                  text={
                    currentEngine.enabled
                      ? text('Ассистент готов к следующему драфту', 'The assistant is ready for the next draft')
                      : text('Включите ассистента до выбора героев', 'Turn on the assistant before hero selection')
                  }
                  reserveLines={2}
                  live="polite"
                />
              </h2>
              <p>
                <AnimatedText
                  text={engineMessage}
                  reserveLines={2}
                  live="polite"
                />
              </p>
              {currentEngine.recognition?.recognized.length ? (
                <div
                  className="recognized-picks"
                  aria-label={text('Распознанные герои', 'Recognized heroes')}
                >
                  {currentEngine.recognition.recognized.slice(0, 5).map((pick) => (
                    <span key={recognitionPickKey(pick)}>
                      <small>
                        {recognitionSideLabel(pick, language)}
                      </small>
                      <strong>
                        {language === 'en'
                          ? pick.heroName || pick.localizedName || 'Unknown hero'
                          : pick.localizedName || pick.heroName || 'Неизвестный герой'}
                      </strong>
                      <em>{Math.round(pick.confidence * 100)}%</em>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="controller-card__preferences">
                <PositionLabel position={activePosition} />
                <RankLabel rank={preferences?.rank} />
              </div>
            </div>
            <div className="engine-control">
              <Switch.Root
                className="engine-switch"
                checked={currentEngine.enabled}
                disabled={toggleMutation.isPending || !engine || !preferences}
                onCheckedChange={onToggle}
                aria-label={currentEngine.enabled
                  ? text('Выключить ассистента', 'Turn off assistant')
                  : text('Включить ассистента', 'Turn on assistant')}
              >
                <Switch.Thumb className="engine-switch__thumb">
                  <span className="engine-switch__icon" data-icon-state={engineIconState}>
                    <ArrowsClockwise
                      className={`engine-switch__icon-layer engine-switch__icon-layer--pending ${isEngineTransitioning ? 'spin' : ''}`}
                      data-active={engineIconState === 'pending'}
                      size={30}
                      weight="duotone"
                      aria-hidden
                    />
                    <Lightning
                      className="engine-switch__icon-layer engine-switch__icon-layer--enabled"
                      data-active={engineIconState === 'enabled'}
                      size={31}
                      weight="duotone"
                      aria-hidden
                    />
                    <Power
                      className="engine-switch__icon-layer engine-switch__icon-layer--disabled"
                      data-active={engineIconState === 'disabled'}
                      size={30}
                      weight="duotone"
                      aria-hidden
                    />
                  </span>
                </Switch.Thumb>
                <AnimatedText
                  className="engine-switch__copy"
                  text={currentEngine.enabled
                    ? text('ВКЛЮЧЁН', 'ON')
                    : text('ВКЛЮЧИТЬ', 'TURN ON')}
                />
              </Switch.Root>
              <small>
                <AnimatedText
                  text={
                    currentEngine.enabled
                      ? text('Нажмите, чтобы остановить', 'Click to stop')
                      : text('Одно нажатие — и можно свернуть окно', 'One click, then you can minimize the window')
                  }
                  reserveLines={1}
                />
              </small>
            </div>
          </div>
          <div className="controller-card__footer">
            {toggleMutation.isError ? (
              <span role="alert">
                {text(
                  'Не удалось изменить состояние. Проверьте соединение и повторите.',
                  'Could not change the state. Check your connection and try again.',
                )}
              </span>
            ) : currentEngine.phase === 'error' ? (
              <Button
                variant="secondary"
                loading={retryMutation.isPending}
                onClick={() => retryMutation.mutate()}
              >
                {text('Повторить подключение', 'Reconnect')}
              </Button>
            ) : currentEngine.latestAnalysisId ? (
              <Link
                className="controller-result-link"
                to={`/result/${currentEngine.latestAnalysisId}`}
              >
                {text('Открыть свежий результат', 'Open latest result')}
                <ArrowSquareOut size={17} weight="duotone" aria-hidden />
              </Link>
            ) : (
              <span>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                {text(
                  'Можно свернуть приложение — ассистент останется в трее',
                  'You can minimize the app — the assistant will stay in the tray',
                )}
              </span>
            )}
          </div>
        </Panel>

        <Panel className="system-card" data-reveal>
          <div className="hud-heading">
            <span>{text('Сигнал игры', 'Game signal')}</span>
            <Broadcast size={21} weight="duotone" aria-hidden />
          </div>
          <div
            className="assistant-mode-reveal"
            data-open={currentEngine.enabled}
            aria-hidden={!currentEngine.enabled}
          >
            <div className="assistant-mode-reveal__inner">
              <div
                className="assistant-mode-switch"
                role="radiogroup"
                aria-label={text('Способ распознавания драфта', 'Draft detection method')}
                aria-busy={modeMutation.isPending}
                data-mode={assistantMode}
              >
                <span className="assistant-mode-switch__indicator" aria-hidden />
                <button
                  type="button"
                  role="radio"
                  {...assistantModeOptionA11y('vision', assistantMode, modeInteractionBlocked)}
                  data-assistant-mode="vision"
                  className={assistantMode === 'vision' ? 'is-active' : ''}
                  onClick={() => selectAssistantMode('vision')}
                  onKeyDown={handleModeKeyDown}
                >
                  <Eye size={15} weight="duotone" aria-hidden />
                  <span>Draft Vision</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  {...assistantModeOptionA11y('overwolf', assistantMode, modeInteractionBlocked)}
                  data-assistant-mode="overwolf"
                  className={assistantMode === 'overwolf' ? 'is-active' : ''}
                  onClick={() => selectAssistantMode('overwolf')}
                  onKeyDown={handleModeKeyDown}
                >
                  <Radio size={15} weight="duotone" aria-hidden />
                  <span>Overwolf Live</span>
                  <i data-state={overwolfState.phase} aria-hidden />
                </button>
              </div>
            </div>
          </div>
          {gameSignalMode === 'off' ? (
            <div
              className={`system-card__signal system-card__signal--compact ${gameSignalUnavailable ? 'system-card__signal--error' : ''}`}
            >
              <span className="system-card__pulse" aria-hidden />
              <div>{gameSignalCopy}</div>
            </div>
          ) : (
            <div className="system-card__active-signal" data-state={gameSignalMode}>
              <GameSignalVisual mode={gameSignalMode} />
              <div className="system-card__signal system-card__signal--active">
                {gameSignalCopy}
              </div>
            </div>
          )}
          <dl className="system-card__telemetry">
            <div>
              <dt>{text('Последний сигнал', 'Last signal')}</dt>
              <dd>{formatRelative(currentEngine.lastSeenAt, language)}</dd>
            </div>
            <div>
              <dt>{assistantMode === 'overwolf' ? text('Канал', 'Channel') : text('Сигналы', 'Signals')}</dt>
              <dd>
                {assistantMode === 'overwolf'
                  ? overwolfPhaseCopy
                  : text('Кадр + GSI ориентация', 'Frame + GSI orientation')}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel className="quota-card" data-reveal>
          <div className="hud-heading">
            <span>{text('Лимит анализа', 'Analysis limit')}</span>
            <Lightning size={20} weight="duotone" aria-hidden />
          </div>
          <div className="quota-card__number">
            <strong>{remaining}</strong>
            <span>
              {text(`из ${limit}`, `of ${limit}`)}
              <small>{text('осталось', 'remaining')}</small>
            </span>
          </div>
          <div
            className="quota-progress"
            role="progressbar"
            aria-label={text('Оставшиеся попытки', 'Remaining attempts')}
            aria-valuenow={remaining}
            aria-valuemin={0}
            aria-valuemax={limit}
          >
            <span style={{ transform: `scaleX(${quotaRatio})` }} />
          </div>
          <div className="quota-card__footer">
            <small>
              {text('Обновление', 'Refresh')} {formatRelative(quota?.nextRefillAt, language)}
            </small>
            {quotaExhausted ? (
              <TextLink to="/profile?section=plan">
                {text('Посмотреть план', 'View plan')}
              </TextLink>
            ) : null}
          </div>
        </Panel>

        <Panel className="latest-card" data-reveal>
          <div className="hud-heading">
            <span>{text('Последний контрпик', 'Latest counterpick')}</span>
            <Clock size={20} weight="duotone" aria-hidden />
          </div>
          {historyQuery.isPending ? (
            <div className="latest-card__skeleton" />
          ) : latest && primaryHero ? (
            <Link to={`/result/${latest.id}`} className="latest-card__result">
              <HeroIcon hero={primaryHero} eager />
              <div>
                <strong>{heroName(primaryHero, language)}</strong>
                <small>{formatRelative(latest.createdAt, language)}</small>
                <span>
                  {text('Оценка', 'Score')} {Math.round(latest.result.recommendations[0]?.score ?? 0)}
                  <i />
                  {text('Патч', 'Patch')} {latest.result.patch}
                </span>
              </div>
              <ArrowSquareOut size={19} weight="duotone" aria-hidden />
            </Link>
          ) : (
            <div className="latest-card__empty">
              <CrosshairSimple size={30} weight="duotone" aria-hidden />
              <p>
                {text(
                  'Первый проверяемый результат появится после распознанного драфта',
                  'Your first verifiable result will appear after a draft is recognized',
                )}
              </p>
            </div>
          )}
        </Panel>

        <Panel className="method-card" data-reveal>
          <div className="hud-heading">
            <span>{text('Основа расчёта', 'Calculation basis')}</span>
            <Target size={20} weight="duotone" aria-hidden />
          </div>
          <strong>{text('Скользящая выборка всех рангов', 'Rolling all-ranks')}</strong>
          <p>
            {text(
              'Противостояния берутся из накопленной статистики всех рангов. Результат сохраняет отдельные оценки противостояний, синергии и меты вместе с источником данных.',
              'Matchups use accumulated statistics across all ranks. The result keeps separate matchup, synergy, and meta scores together with the data source.',
            )}
          </p>
          <Link to="/history" className="method-card__link">
            {text('Проверить прошлые расчёты', 'Review previous calculations')}
            <ArrowSquareOut size={17} weight="duotone" aria-hidden />
          </Link>
        </Panel>

        <Panel className="mode-comparison-card" data-reveal>
          <div className="mode-comparison-card__heading">
            <div>
              <span>{text('Два способа видеть драфт', 'Two ways to read the draft')}</span>
              <strong>{text('Выберите источник под свою игру', 'Choose the source that fits your setup')}</strong>
            </div>
            <small>{text('Оба режима обновляют расчёт автоматически', 'Both modes update the result automatically')}</small>
          </div>
          <div className="mode-comparison-grid">
            <article data-active={assistantMode === 'vision'}>
              <header>
                <span className="mode-comparison-card__icon"><Eye size={20} weight="duotone" aria-hidden /></span>
                <div>
                  <strong>Draft Vision</strong>
                  <small>{text('Встроено в Counterpick', 'Built into Counterpick')}</small>
                </div>
                <span className="mode-comparison-card__choice">
                  {assistantMode === 'vision' ? text('Выбрано', 'Selected') : text('Доступно', 'Available')}
                </span>
              </header>
              <p>
                {text(
                  'Автоматически проверяет новые пики по существенно изменившимся кадрам окна Dota 2, а локальный GSI сообщает фазу, команду и выбранного вами героя для точного сопоставления сторон. Работает без дополнительной платформы.',
                  'Automatically checks for new picks when the Dota 2 window image changes substantially, while local GSI supplies the phase, team, and your selected hero to align the sides. It needs no extra platform.',
                )}
              </p>
              <div className="mode-comparison-card__terms">
                <TermTooltip
                  term={text('Распознавание кадра', 'Frame recognition')}
                  explanation={text(
                    'Кадр уходит в API, когда изображение окна существенно изменилось, чтобы проверить новые пики; одинаковые кадры не отправляются. Сервер обрабатывает кадр в памяти: сначала сопоставляет портреты локально, а при низкой уверенности может передать выделенную область драфта настроенному внешнему провайдеру распознавания. Исходник не сохраняется.',
                    'A frame goes to the API when the window image changes substantially so it can check for new picks; identical frames are not sent. The server processes the frame in memory, first matching portraits locally and, when confidence is low, may send the extracted draft region to the configured external recognition provider. The source image is not stored.',
                  )}
                />
                <span>{text('Без Overwolf', 'No Overwolf needed')}</span>
              </div>
            </article>
            <article data-active={assistantMode === 'overwolf'}>
              <header>
                <span className="mode-comparison-card__icon"><Radio size={20} weight="duotone" aria-hidden /></span>
                <div>
                  <strong>Overwolf Live</strong>
                  <small>{text('Точные игровые события', 'Exact game events')}</small>
                </div>
                <span className="mode-comparison-card__choice" data-state={overwolfState.phase}>
                  {overwolfPhaseCopy}
                </span>
              </header>
              <p>
                {text(
                  'Автоматически обновляет расчёт по точным событиям Overwolf без скриншотов. Локальный bridge передаёт ID героев в Counterpick, затем нормализованный драфт отправляется в Counterpick API.',
                  'Automatically updates the result from exact Overwolf events without screenshots. A local bridge passes hero IDs to Counterpick, then the normalized draft is sent to the Counterpick API.',
                )}
              </p>
              <div className="mode-comparison-card__terms">
                <TermTooltip
                  term="GEP"
                  explanation={text(
                    'Game Events Provider — официальный канал Overwolf для событий поддерживаемой игры.',
                    'Game Events Provider is Overwolf’s official channel for supported-game events.',
                  )}
                />
                <TermTooltip
                  term={text('Локальный bridge', 'Local bridge')}
                  explanation={text(
                    'Защищённое соединение только через 127.0.0.1; данные не доступны другим устройствам.',
                    'An authenticated 127.0.0.1-only connection that is unavailable to other devices.',
                  )}
                />
                <span>{text('Без скриншотов', 'No screenshots')}</span>
              </div>
              <div className="mode-comparison-card__actions">
                <Button
                  variant="secondary"
                  className="mode-comparison-card__button"
                  loading={overwolfConnectMutation.isPending}
                  disabled={overwolfState.phase === 'connected' || overwolfState.phase === 'pairing'}
                  onClick={connectOverwolf}
                >
                  <Plug size={16} weight="duotone" aria-hidden />
                  {overwolfState.phase === 'connected'
                    ? text('Подключено', 'Connected')
                    : text('Подключить', 'Connect')}
                </Button>
                <Button
                  variant="quiet"
                  className="mode-comparison-card__button"
                  loading={overwolfInstallMutation.isPending}
                  disabled={!overwolfState.configured}
                  title={!overwolfState.configured
                    ? text('Ссылка станет доступна после проверки Overwolf', 'Available after Overwolf review')
                    : undefined}
                  onClick={() => overwolfInstallMutation.mutate()}
                >
                  <DownloadSimple size={16} weight="duotone" aria-hidden />
                  {text('Официальная установка', 'Official install')}
                </Button>
              </div>
              {!overwolfState.configured ? (
                <small className="mode-comparison-card__release-note">
                  <Info size={14} weight="duotone" aria-hidden />
                  {text(
                    'Counterpick Live пока не опубликован в Overwolf Appstore. Одна платформа Overwolf не установит companion и не включит Live-режим.',
                    'Counterpick Live is not published in the Overwolf Appstore yet. The Overwolf platform alone will not install the companion or enable Live mode.',
                  )}
                </small>
              ) : null}
              {overwolfState.lastError || overwolfConnectMutation.isError || overwolfInstallMutation.isError ? (
                <small className="mode-comparison-card__error" role="alert">
                  {overwolfState.lastError ?? text(
                    'Не удалось выполнить действие. Проверьте Overwolf и повторите.',
                    'The action failed. Check Overwolf and try again.',
                  )}
                </small>
              ) : null}
            </article>
          </div>
        </Panel>
      </div>

      <section className="dashboard-section" data-reveal>
        <div className="dashboard-section__heading">
          <div>
            <h2>{text('Последние контрпики', 'Latest counterpicks')}</h2>
            <p>
              {text(
                'Каждый ответ хранит итоговую оценку, компоненты расчёта и источник.',
                'Each recommendation keeps its final score, calculation components, and source.',
              )}
            </p>
          </div>
          <TextLink to="/history">{text('Вся история', 'Full history')}</TextLink>
        </div>
        {historyQuery.isPending ? (
          <AsyncState status="loading" />
        ) : historyQuery.data?.items.length ? (
          <div
            className="feedback-carousel"
            aria-label={text('Недавние рекомендации', 'Recent recommendations')}
          >
            {historyQuery.data.items.map((analysis) => {
              const recommendation = analysis.result.recommendations[0];
              if (!recommendation) return null;
              return (
                <Link
                  className="recommendation-card"
                  key={analysis.id}
                  to={`/result/${analysis.id}`}
                >
                  <HeroIcon hero={recommendation.hero} />
                  <div className="recommendation-card__body">
                    <small>{formatRelative(analysis.createdAt, language)}</small>
                    <strong>{heroName(recommendation.hero, language)}</strong>
                    <span>
                      {text('Оценка', 'Score')} {Math.round(recommendation.score)}
                      <i />
                      {text('Патч', 'Patch')} {analysis.result.patch}
                    </span>
                  </div>
                  <ArrowSquareOut size={18} weight="duotone" aria-hidden />
                </Link>
              );
            })}
          </div>
        ) : (
          <AsyncState
            status="empty"
            title={text('Решений пока нет', 'No results yet')}
            description={text(
              'Включите ассистента — он сохранит первый результат автоматически.',
              'Turn on the assistant and it will save the first result automatically.',
            )}
          />
        )}
      </section>

      {consentOpen ? (
        <ModalPortal>
          <div className="modal-backdrop" role="presentation">
          <section
            className="consent-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="capture-consent-title"
            ref={consentRef}
            tabIndex={-1}
            onKeyDown={(event) => {
              handleDialogKeyDown(event, consentMutation.isPending, () => setConsentOpen(false));
            }}
          >
            <span className="consent-dialog__icon">
              <Monitor size={25} weight="duotone" aria-hidden />
            </span>
            <p className="consent-dialog__lead">
              {text('Перед первым запуском', 'Before the first launch')}
            </p>
            <h2 id="capture-consent-title">
              {text('Разрешить Draft Vision?', 'Allow Draft Vision?')}
            </h2>
            <p>
              {text(
                'Counterpick использует кадр окна Dota 2 и локальные GSI-сигналы фазы, команды и выбранного героя. Кадр отправляется в API, когда изображение окна существенно изменилось, чтобы проверить новые пики; одинаковые кадры не отправляются, исходник не сохраняется.',
                'Counterpick uses a Dota 2 window frame plus local GSI phase, team, and selected-hero signals. A frame goes to the API when the window image changes substantially so it can check for new picks; identical frames are not sent, and the source image is not stored.',
              )}
            </p>
            <ul>
              <li>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                {text(
                  'Исходные ID/имя выбранного героя используются только в памяти и не отправляются или сохраняются; вместе с кадром уходят вычисленная сторона визуальной группы и метка источника, остальные поля GSI сразу отбрасываются',
                  'The raw selected-hero ID/name are used only in memory and are not sent or stored; only the derived visual-group side and source label accompany the frame, and all other GSI fields are discarded immediately',
                )}
              </li>
              <li>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                {text('Память игры и другие окна не анализируются', 'Game memory and other windows are not analyzed')}
              </li>
              <li>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                {text(
                  'Захват можно выключить одним переключателем',
                  'Capture can be disabled with one toggle',
                )}
              </li>
              <li>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                {text(
                  'Сервер обрабатывает кадр в памяти; при низкой уверенности выделенная область драфта может уйти настроенному внешнему провайдеру распознавания',
                  'The server processes the frame in memory; when confidence is low, the extracted draft region may go to the configured external recognition provider',
                )}
              </li>
              <li>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                {text(
                  'Исходный кадр не хранится; в истории остаётся только результат расчёта',
                  'The source frame is not stored; only the calculated result remains in history',
                )}
              </li>
            </ul>
            {consentMutation.isError ? (
              <p className="form-error" role="alert">
                {text(
                  'Не удалось сохранить разрешение. Попробуйте ещё раз.',
                  'Could not save your permission. Try again.',
                )}
              </p>
            ) : null}
            <div className="consent-dialog__actions">
              <Button
                variant="secondary"
                disabled={consentMutation.isPending}
                onClick={() => setConsentOpen(false)}
              >
                {text('Не сейчас', 'Not now')}
              </Button>
              <Button
                loading={consentMutation.isPending}
                onClick={() => consentMutation.mutate()}
              >
                {text('Разрешить и включить', 'Allow and enable')}
              </Button>
            </div>
          </section>
          </div>
        </ModalPortal>
      ) : null}

      {overwolfConsentOpen ? (
        <ModalPortal>
          <div className="modal-backdrop" role="presentation">
          <section
            className="consent-dialog consent-dialog--overwolf"
            role="dialog"
            aria-modal="true"
            aria-labelledby="overwolf-consent-title"
            ref={overwolfConsentRef}
            tabIndex={-1}
            onKeyDown={(event) => {
              handleDialogKeyDown(
                event,
                overwolfConnectMutation.isPending,
                () => setOverwolfConsentOpen(false),
              );
            }}
          >
            <span className="consent-dialog__icon">
              <Radio size={25} weight="duotone" aria-hidden />
            </span>
            <p className="consent-dialog__lead">
              {text('Отдельный видимый companion', 'A separate visible companion')}
            </p>
            <h2 id="overwolf-consent-title">
              {text('Подключить Overwolf Live?', 'Connect Overwolf Live?')}
            </h2>
            <p>
              {text(
                'Counterpick Live получает события выбора героев через Overwolf по защищённому локальному соединению. Steam ID и имена не отправляются; ID героев, стороны, позиция, баны и выбранный ранг передаются в Counterpick API для расчёта, а результат сохраняется в истории аккаунта.',
                'Counterpick Live receives hero-selection events through an authenticated local connection. Steam IDs and names are not sent; hero IDs, sides, position, bans, and selected rank go to the Counterpick API for calculation, and the result is saved in account history.',
              )}
            </p>
            <ul>
              <li>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                {text('Скриншоты и чтение памяти игры не используются', 'No screenshots or game-memory reading')}
              </li>
              <li>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                {text(
                  'Steam ID и имена остаются внутри companion; в API уходят только данные драфта',
                  'Steam IDs and names stay inside the companion; only draft data goes to the API',
                )}
              </li>
              <li>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                {text(
                  'Dota 2 требует параметр запуска -gamestateintegration',
                  'Dota 2 requires the -gamestateintegration launch option',
                )}
              </li>
              <li>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                {text(
                  'Установка Overwolf открывается отдельно и всегда требует вашего подтверждения условий',
                  'Overwolf installation opens separately and always requires your agreement to its terms',
                )}
              </li>
            </ul>
            {overwolfConnectMutation.isError ? (
              <p className="form-error" role="alert">
                {text(
                  'Не удалось сохранить разрешение. Попробуйте ещё раз.',
                  'Could not save your permission. Try again.',
                )}
              </p>
            ) : null}
            <div className="consent-dialog__actions">
              <Button
                variant="secondary"
                disabled={overwolfConnectMutation.isPending}
                onClick={() => setOverwolfConsentOpen(false)}
              >
                {text('Не сейчас', 'Not now')}
              </Button>
              <Button
                loading={overwolfConnectMutation.isPending}
                onClick={() => overwolfConnectMutation.mutate(new Date().toISOString())}
              >
                {text('Разрешить и включить', 'Allow and enable')}
              </Button>
            </div>
          </section>
          </div>
        </ModalPortal>
      ) : null}
    </main>
  );
}

function TermTooltip({ term, explanation }: { term: string; explanation: string }) {
  const tooltipId = useId();

  return (
    <button className="term-tooltip" type="button" aria-describedby={tooltipId}>
      <span className="term-tooltip__label">
        {term}
        <Info size={12} weight="duotone" aria-hidden />
      </span>
      <span className="term-tooltip__bubble" id={tooltipId} role="tooltip">{explanation}</span>
    </button>
  );
}

function PageFallback({ onRetry }: { onRetry: () => void }) {
  const { text } = useI18n();
  return (
    <main className="page" id="main-content">
      <AsyncState
        status="error"
        title={text('Дашборд временно недоступен', 'Dashboard is temporarily unavailable')}
        description={text(
          'Не удалось получить лимит и историю с Render.',
          'Could not load your limit and history from Render.',
        )}
        onRetry={onRetry}
      />
    </main>
  );
}
