import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cloud,
  Database,
  Gauge,
  LoaderCircle,
  RefreshCw,
  Server,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
  Zap,
} from 'lucide-react';
import { Button, ChartTooltip, Panel, StatusBadge } from '../components/ui';
import { formatDuration, formatNumber, formatPercent, formatRelativeTime } from '../lib/format';
import type { AdminAnalysis } from '../types';

type SystemPageProps = {
  analyses: AdminAnalysis[];
  onNotify: (message: string) => void;
};

const services = [
  { name: 'API', description: 'Fastify · eu-central', latency: 84, icon: Server, status: 'healthy' },
  { name: 'PostgreSQL', description: 'Основная база', latency: 21, icon: Database, status: 'healthy' },
  { name: 'OpenDota', description: 'Мета P1–P5 · патч 7.41', latency: 310, icon: Cloud, status: 'healthy' },
  { name: 'Gemini Vision', description: 'gemini-3.5-flash-lite', latency: 2_480, icon: Zap, status: 'degraded' },
] as const;

export function SystemPage({ analyses, onNotify }: SystemPageProps) {
  const [checkState, setCheckState] = useState<'idle' | 'checking' | 'complete'>('idle');
  const checkTimer = useRef<number | null>(null);
  const failed = analyses.filter((analysis) => analysis.status === 'failed');
  const processing = analyses.filter((analysis) => analysis.status === 'processing');
  const photo = analyses.filter((analysis) => analysis.source === 'photo');
  const estimatedCost = photo.reduce((sum, analysis) => sum + analysis.costUsd, 0);
  const timeouts = failed.filter((analysis) => analysis.errorCode === 'VISION_TIMEOUT').length;
  const blurry = failed.filter((analysis) => analysis.errorCode === 'IMAGE_TOO_BLURRY').length;
  const maxLatency = Math.max(...services.map((service) => service.latency));

  useEffect(() => () => {
    if (checkTimer.current) window.clearTimeout(checkTimer.current);
  }, []);

  const runSystemCheck = () => {
    if (checkState === 'checking') return;
    if (checkTimer.current) window.clearTimeout(checkTimer.current);
    setCheckState('checking');
    checkTimer.current = window.setTimeout(() => {
      setCheckState('complete');
      onNotify('Проверка завершена: 4 сервиса отвечают');
      checkTimer.current = null;
    }, 1_450);
  };

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Инфраструктура и интеграции</span>
          <h1>Система</h1>
          <p>Состояние сервисов, очередь и ошибки за последний час.</p>
        </div>
        <Button
          className={`system-check-button system-check-button--${checkState}`}
          icon={checkState === 'checking'
            ? <LoaderCircle className="button-spinner" size={16} />
            : checkState === 'complete'
              ? <CheckCircle2 size={16} />
              : <RefreshCw size={16} />}
          onClick={runSystemCheck}
          disabled={checkState === 'checking'}
          aria-live="polite"
        >
          {checkState === 'checking'
            ? 'Проверяем…'
            : checkState === 'complete'
              ? 'Проверить ещё раз'
              : 'Проверить сейчас'}
        </Button>
      </header>

      <div className={`system-status-banner system-status-banner--${checkState}`} aria-live="polite">
        <div className="system-status-banner__mark">
          {checkState === 'checking'
            ? <LoaderCircle className="button-spinner" size={22} />
            : <CheckCircle2 size={22} />}
        </div>
        <div>
          <strong>
            {checkState === 'checking'
              ? 'Проверяем доступность сервисов'
              : checkState === 'complete'
                ? 'Проверка завершена — всё доступно'
                : 'Сервис работает стабильно'}
          </strong>
          <p>
            {checkState === 'checking'
              ? 'Отправляем контрольные запросы в API, базу, OpenDota и Vision.'
              : checkState === 'complete'
                ? 'Все 4 сервиса ответили. Vision по-прежнему медленнее обычного.'
                : 'Основные функции доступны. Vision отвечает медленнее обычного.'}
          </p>
        </div>
        <StatusBadge tone={checkState === 'checking' ? 'warning' : 'positive'}>
          {checkState === 'checking' ? 'Выполняется' : checkState === 'complete' ? 'Только что' : '99,96% uptime'}
        </StatusBadge>
      </div>

      <div className="service-grid">
        {services.map((service) => {
          const Icon = service.icon;
          return (
            <Panel className="service-card" key={service.name}>
              <div className="service-card__header">
                <span><Icon size={18} /></span>
                <i className={`service-dot service-dot--${service.status}`} />
              </div>
              <strong>{service.name}</strong>
              <p>{service.description}</p>
              <div><span>Ответ</span><b>{formatDuration(service.latency)}</b></div>
            </Panel>
          );
        })}
      </div>

      <div className="system-grid">
        <Panel className="latency-panel">
          <div className="panel-heading panel-heading--compact">
            <div>
              <h2>Время ответа</h2>
              <p>Медиана последних проверок доступности.</p>
            </div>
            <Gauge size={19} className="panel-heading__icon" />
          </div>
          <div className="latency-list">
            {services.map((service) => (
              <div
                className="chart-tooltip-anchor"
                key={service.name}
                tabIndex={0}
                aria-label={`${service.name}: медиана ответа ${formatDuration(service.latency)}`}
              >
                <span>{service.name}</span>
                <div><i style={{ width: `${Math.max(4, (service.latency / maxLatency) * 100)}%` }} /></div>
                <strong>{formatDuration(service.latency)}</strong>
                <ChartTooltip
                  title={service.name}
                  value={formatDuration(service.latency)}
                  detail={service.status === 'healthy' ? 'Сервис в норме' : 'Ответ медленнее обычного'}
                  className="chart-tooltip--floating"
                />
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="queue-panel">
          <div className="panel-heading panel-heading--compact">
            <div>
              <h2>Очередь запросов</h2>
              <p>Текущая нагрузка анализа.</p>
            </div>
            <Activity size={19} className="panel-heading__icon" />
          </div>
          <div className="queue-number">
            <strong>{processing.length}</strong>
            <span>в обработке сейчас</span>
          </div>
          <div className="queue-meta">
            <div><span>Самый старый</span><strong>18 сек</strong></div>
            <div><span>За последний час</span><strong>87</strong></div>
            <div><span>Повторные попытки</span><strong>2</strong></div>
          </div>
        </Panel>
      </div>

      <div className="system-bottom-grid">
        <Panel className="error-panel">
          <div className="panel-heading panel-heading--compact">
            <div>
              <h2>Причины ошибок</h2>
              <p>{failed.length} неуспешных проверок в демо-наборе.</p>
            </div>
            <TriangleAlert size={19} className="panel-heading__icon panel-heading__icon--warning" />
          </div>
          <div className="error-list">
            <div>
              <span className="error-list__icon"><Cloud size={17} /></span>
              <p><strong>VISION_TIMEOUT</strong><small>Провайдер не ответил за 30 секунд</small></p>
              <b>{timeouts}</b>
            </div>
            <div>
              <span className="error-list__icon"><TriangleAlert size={17} /></span>
              <p><strong>IMAGE_TOO_BLURRY</strong><small>Изображение недостаточного качества</small></p>
              <b>{blurry}</b>
            </div>
          </div>
        </Panel>

        <Panel className="usage-panel">
          <div className="panel-heading panel-heading--compact">
            <div>
              <h2>Gemini usage</h2>
              <p>Распознавание фото через настроенную vision-модель.</p>
            </div>
            <WalletCards size={19} className="panel-heading__icon" />
          </div>
          <div className="usage-main">
            <span>Оценка расходов</span>
            <strong>${estimatedCost.toFixed(2)}</strong>
            <small>{formatNumber(photo.length)} фото-запросов</small>
          </div>
          <div
            className="usage-progress-chart chart-tooltip-anchor"
            tabIndex={0}
            aria-label={`Использовано ${formatPercent(Math.min(100, estimatedCost * 10), 1)} демо-бюджета`}
          >
            <div className="usage-progress"><i style={{ width: `${Math.min(100, estimatedCost * 120)}%` }} /></div>
            <ChartTooltip
              title="Демо-бюджет"
              value={`${formatPercent(Math.min(100, estimatedCost * 10), 1)} использовано`}
              detail={`$${estimatedCost.toFixed(2)} из $10`}
              className="chart-tooltip--floating"
            />
          </div>
          <div className="usage-footer">
            <span>Демо-бюджет $10</span>
            <strong>{formatPercent(Math.min(100, estimatedCost * 10), 1)} использовано</strong>
          </div>
        </Panel>

        <Panel className="security-panel">
          <div className="panel-heading panel-heading--compact">
            <div>
              <h2>Безопасность</h2>
              <p>Последние важные события.</p>
            </div>
            <ShieldCheck size={19} className="panel-heading__icon" />
          </div>
          <div className="security-list">
            <div><i className="service-dot service-dot--healthy" /><p><strong>Ошибок входа нет</strong><small>{formatRelativeTime('2026-07-26T15:56:00.000Z')}</small></p></div>
            <div><i className="service-dot service-dot--healthy" /><p><strong>Webhook подтверждён</strong><small>{formatRelativeTime('2026-07-26T15:41:00.000Z')}</small></p></div>
            <div><i className="service-dot service-dot--healthy" /><p><strong>Резервная копия готова</strong><small>{formatRelativeTime('2026-07-26T14:03:00.000Z')}</small></p></div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
