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
import { phaseCopy, formatRelative, heroName } from '../format';
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
  const status = phaseCopy(currentEngine.phase);
  const quotaExhausted = limit > 0 && remaining <= 0;
  const isEngineTransitioning = toggleMutation.isPending || currentEngine.phase === 'starting';
  const engineIconState = isEngineTransitioning
    ? 'pending'
    : currentEngine.enabled
      ? 'enabled'
      : 'disabled';

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
            {new Intl.DateTimeFormat('ru-RU', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(new Date())}
          </span>
          <h1>Автоконтрпик</h1>
          <p>Следит за стадией выбора героев и показывает расчёт, когда данных достаточно.</p>
        </div>
      </header>

      <div className="dashboard-grid">
        <Panel className={`controller-card controller-card--${currentEngine.phase}`} data-reveal>
          <div className="controller-card__ambient" aria-hidden />
          <div className="controller-card__header">
            <div className="controller-card__identity">
              <CrosshairSimple size={19} weight="duotone" aria-hidden />
              <span>Ассистент драфта</span>
            </div>
            <div className={`controller-card__status controller-card__status--${currentEngine.phase}`}>
              <span className="status-dot" />
              <StatusScrub text={status.title} />
            </div>
            <span className="controller-card__local">
              <ShieldCheck size={17} weight="duotone" aria-hidden />
              Только окно Dota 2
            </span>
          </div>
          <div className="controller-card__content">
            <div className="controller-card__brief">
              <h2>
                <AnimatedText
                  text={
                    currentEngine.enabled
                      ? 'Ассистент готов к следующему драфту'
                      : 'Включите ассистента до выбора героев'
                  }
                  reserveLines={2}
                  live="polite"
                />
              </h2>
              <p>
                <AnimatedText
                  text={currentEngine.message || status.description}
                  reserveLines={2}
                  live="polite"
                />
              </p>
              {currentEngine.recognition?.recognized.length ? (
                <div className="recognized-picks" aria-label="Распознанные герои">
                  {currentEngine.recognition.recognized.slice(0, 5).map((pick) => (
                    <span key={`${pick.side}-${pick.slot}`}>
                      <small>{pick.side === 'enemy' ? 'Противник' : 'Союзник'}</small>
                      <strong>{pick.localizedName || pick.heroName || 'Неизвестный герой'}</strong>
                      <em>{Math.round(pick.confidence * 100)}%</em>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="controller-card__preferences">
                <PositionLabel position={preferences?.position ?? 1} />
                <RankLabel rank={preferences?.rank} />
              </div>
            </div>
            <div className="engine-control">
              <Switch.Root
                className="engine-switch"
                checked={currentEngine.enabled}
                disabled={toggleMutation.isPending || !engine || !preferences}
                onCheckedChange={onToggle}
                aria-label={currentEngine.enabled ? 'Выключить ассистента' : 'Включить ассистента'}
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
                  text={currentEngine.enabled ? 'ВКЛЮЧЁН' : 'ВКЛЮЧИТЬ'}
                />
              </Switch.Root>
              <small>
                <AnimatedText
                  text={
                    currentEngine.enabled
                      ? 'Нажмите, чтобы остановить'
                      : 'Одно нажатие — и можно свернуть окно'
                  }
                  reserveLines={1}
                />
              </small>
            </div>
          </div>
          <div className="controller-card__footer">
            {toggleMutation.isError ? (
              <span role="alert">
                Не удалось изменить состояние. Проверьте соединение и повторите.
              </span>
            ) : currentEngine.phase === 'error' ? (
              <Button
                variant="secondary"
                loading={retryMutation.isPending}
                onClick={() => retryMutation.mutate()}
              >
                Повторить подключение
              </Button>
            ) : currentEngine.latestAnalysisId ? (
              <Link
                className="controller-result-link"
                to={`/result/${currentEngine.latestAnalysisId}`}
              >
                Открыть свежий результат
                <ArrowSquareOut size={17} weight="duotone" aria-hidden />
              </Link>
            ) : (
              <span>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                Можно свернуть приложение — ассистент останется в трее
              </span>
            )}
          </div>
        </Panel>

        <Panel className="system-card" data-reveal>
          <div className="hud-heading">
            <span>Сигнал игры</span>
            <Broadcast size={21} weight="duotone" aria-hidden />
          </div>
          <div
            className={`system-card__signal ${currentEngine.dotaDetected ? 'system-card__signal--live' : ''}`}
          >
            <span className="system-card__pulse" aria-hidden />
            <div>
              <strong>
                <AnimatedText
                  text={currentEngine.dotaDetected ? 'Dota 2 обнаружена' : 'Ожидаем Dota 2'}
                  reserveLines={1}
                  live="polite"
                />
              </strong>
              <p>
                <AnimatedText
                  text={
                    currentEngine.dotaDetected
                      ? 'Окно игры доступно для анализа'
                      : 'Запустите игру — повторно включать ассистента не нужно'
                  }
                  reserveLines={2}
                />
              </p>
            </div>
          </div>
          <dl className="system-card__telemetry">
            <div>
              <dt>Последний сигнал</dt>
              <dd>{formatRelative(currentEngine.lastSeenAt)}</dd>
            </div>
            <div>
              <dt>Захват</dt>
              <dd>Только окно игры</dd>
            </div>
          </dl>
        </Panel>

        <Panel className="quota-card" data-reveal>
          <div className="hud-heading">
            <span>Лимит анализа</span>
            <Lightning size={20} weight="duotone" aria-hidden />
          </div>
          <div className="quota-card__number">
            <strong>{remaining}</strong>
            <span>
              из {limit}
              <small>осталось</small>
            </span>
          </div>
          <div
            className="quota-progress"
            role="progressbar"
            aria-label="Оставшиеся попытки"
            aria-valuenow={remaining}
            aria-valuemin={0}
            aria-valuemax={limit}
          >
            <span style={{ transform: `scaleX(${quotaRatio})` }} />
          </div>
          <div className="quota-card__footer">
            <small>Обновление {formatRelative(quota?.nextRefillAt)}</small>
            {quotaExhausted ? (
              <TextLink to="/profile?section=plan">Посмотреть план</TextLink>
            ) : null}
          </div>
        </Panel>

        <Panel className="latest-card" data-reveal>
          <div className="hud-heading">
            <span>Последний контрпик</span>
            <Clock size={20} weight="duotone" aria-hidden />
          </div>
          {historyQuery.isPending ? (
            <div className="latest-card__skeleton" />
          ) : latest && primaryHero ? (
            <Link to={`/result/${latest.id}`} className="latest-card__result">
              <HeroIcon hero={primaryHero} eager />
              <div>
                <strong>{heroName(primaryHero)}</strong>
                <small>{formatRelative(latest.createdAt)}</small>
                <span>
                  Score {Math.round(latest.result.recommendations[0]?.score ?? 0)}
                  <i />
                  Патч {latest.result.patch}
                </span>
              </div>
              <ArrowSquareOut size={19} weight="duotone" aria-hidden />
            </Link>
          ) : (
            <div className="latest-card__empty">
              <CrosshairSimple size={30} weight="duotone" aria-hidden />
              <p>Первый проверяемый результат появится после распознанного драфта</p>
            </div>
          )}
        </Panel>

        <Panel className="method-card" data-reveal>
          <div className="hud-heading">
            <span>Основа расчёта</span>
            <Target size={20} weight="duotone" aria-hidden />
          </div>
          <strong>Rolling all-ranks</strong>
          <p>
            Matchup берётся по накопленной статистике всех рангов. В результате остаются
            отдельные score для matchup, синергии и меты вместе с источником данных.
          </p>
          <Link to="/history" className="method-card__link">
            Проверить прошлые расчёты
            <ArrowSquareOut size={17} weight="duotone" aria-hidden />
          </Link>
        </Panel>
      </div>

      <section className="dashboard-section" data-reveal>
        <div className="dashboard-section__heading">
          <div>
            <h2>Последние контрпики</h2>
            <p>Каждый ответ хранит итоговый score, компоненты расчёта и источник.</p>
          </div>
          <TextLink to="/history">Вся история</TextLink>
        </div>
        {historyQuery.isPending ? (
          <AsyncState status="loading" />
        ) : historyQuery.data?.items.length ? (
          <div className="feedback-carousel" aria-label="Недавние рекомендации">
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
                    <small>{formatRelative(analysis.createdAt)}</small>
                    <strong>{heroName(recommendation.hero)}</strong>
                    <span>
                      Score {Math.round(recommendation.score)}
                      <i />
                      Патч {analysis.result.patch}
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
            title="Решений пока нет"
            description="Включите ассистента — он сохранит первый результат автоматически."
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
            <p className="consent-dialog__lead">Перед первым запуском</p>
            <h2 id="capture-consent-title">Разрешить захват окна Dota 2?</h2>
            <p>
              Counterpick делает снимок только в момент драфта, отправляет его на
              распознавание и не сохраняет исходное изображение в истории.
            </p>
            <ul>
              <li>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                Другие окна не анализируются
              </li>
              <li>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                Захват можно выключить одним переключателем
              </li>
              <li>
                <CheckCircle size={17} weight="duotone" aria-hidden />
                В историю попадает только результат расчёта
              </li>
            </ul>
            {consentMutation.isError ? (
              <p className="form-error" role="alert">
                Не удалось сохранить разрешение. Попробуйте ещё раз.
              </p>
            ) : null}
            <div className="consent-dialog__actions">
              <Button
                variant="secondary"
                disabled={consentMutation.isPending}
                onClick={() => setConsentOpen(false)}
              >
                Не сейчас
              </Button>
              <Button
                loading={consentMutation.isPending}
                onClick={() => consentMutation.mutate()}
              >
                Разрешить и включить
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function PageFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="page" id="main-content">
      <AsyncState
        status="error"
        title="Дашборд временно недоступен"
        description="Не удалось получить лимит и историю с Render."
        onRetry={onRetry}
      />
    </main>
  );
}
