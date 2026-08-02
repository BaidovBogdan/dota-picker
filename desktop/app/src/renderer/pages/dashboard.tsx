import * as Switch from '@radix-ui/react-switch';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Broadcast,
  CheckCircle,
  Clock,
  CrosshairSimple,
  Lightning,
  Monitor,
  Power,
  ShieldCheck,
  Sword,
  Target,
} from '@phosphor-icons/react';
import { Link, useNavigate } from 'react-router';
import { useEffect, useRef, useState } from 'react';

import { desktop } from '../bridge';
import { AnimatedText } from '../components/animated-text';
import { PositionLabel, RankLabel } from '../components/dota-taxonomy';
import { GameSignalVisual, type GameSignalMode } from '../components/game-signal-visual';
import { phaseCopy, formatRelative, heroName } from '../format';
import { useI18n } from '../i18n';
import { StatusScrub } from '../components/motion';
import { AsyncState, Button, HeroIcon, Panel, TextLink } from '../components/ui';
import { useAppStore } from '../store';
import type { EngineState } from '../types';

export function DashboardPage() {
  const account = useAppStore((state) => state.account);
  const engine = useAppStore((state) => state.engine);
  const preferences = useAppStore((state) => state.preferences);
  const setPreferences = useAppStore((state) => state.setPreferences);
  const [consentOpen, setConsentOpen] = useState(false);
  const consentRef = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { language, locale, text } = useI18n();

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

  const toggleMutation = useMutation({
    mutationFn: desktop.engine.setEnabled,
  });
  const retryMutation = useMutation({
    mutationFn: desktop.engine.retry,
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
          'Включите ассистента, чтобы начать отслеживание окна игры',
          'Turn on the assistant to start watching for the game window',
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

  useEffect(() => {
    if (currentEngine.phase !== 'ready' || !currentEngine.latestAnalysisId) return;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['quota'] }),
      queryClient.invalidateQueries({ queryKey: ['history'] }),
    ]);
  }, [currentEngine.latestAnalysisId, currentEngine.phase, queryClient]);

  useEffect(() => {
    if (consentOpen) consentRef.current?.focus();
  }, [consentOpen]);

  const onToggle = (enabled: boolean) => {
    if (quotaExhausted && enabled) {
      navigate('/profile?section=plan');
      return;
    }
    if (enabled && !preferences?.captureConsent.accepted) {
      setConsentOpen(true);
      return;
    }
    toggleMutation.mutate(enabled);
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
              {text('Только окно Dota 2', 'Dota 2 window only')}
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
                    <span key={`${pick.side}-${pick.slot}`}>
                      <small>
                        {pick.side === 'enemy'
                          ? text('Противник', 'Enemy')
                          : text('Союзник', 'Ally')}
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
              <dt>{text('Захват', 'Capture')}</dt>
              <dd>{text('Только окно игры', 'Game window only')}</dd>
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
        <div className="modal-backdrop" role="presentation">
          <section
            className="consent-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="capture-consent-title"
            ref={consentRef}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !consentMutation.isPending) setConsentOpen(false);
            }}
          >
            <span className="consent-dialog__icon">
              <Monitor size={25} weight="duotone" aria-hidden />
            </span>
            <p className="consent-dialog__lead">
              {text('Перед первым запуском', 'Before the first launch')}
            </p>
            <h2 id="capture-consent-title">
              {text('Разрешить захват окна Dota 2?', 'Allow Dota 2 window capture?')}
            </h2>
            <p>
              {text(
                'Counterpick делает снимок только в момент драфта, отправляет его на распознавание и не сохраняет исходное изображение в истории.',
                'Counterpick captures an image only during the draft, sends it for recognition, and does not save the source image to history.',
              )}
            </p>
            <ul>
              <li>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                {text('Другие окна не анализируются', 'Other windows are not analyzed')}
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
                  'В историю попадает только результат расчёта',
                  'Only the calculated result is saved to history',
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
      ) : null}
    </main>
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
