import { CheckIcon } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

import { useI18n } from '../i18n';
import { BrandMark } from './brand-mark';

export type StartupPhase = 'preferences' | 'session' | 'route';

const phaseOrder: StartupPhase[] = ['preferences', 'session', 'route'];

export function StartupLoader({ phase }: { phase: StartupPhase }) {
  const { text } = useI18n();
  const [takingLonger, setTakingLonger] = useState(false);
  const activeIndex = phaseOrder.indexOf(phase);
  const [visualIndex, setVisualIndex] = useState(() => Math.max(0, activeIndex - 1));
  const stages = [
    {
      key: 'preferences' as const,
      label: text('Настройки', 'Preferences'),
      title: text('Настраиваем Counterpick', 'Preparing Counterpick'),
      description: text(
        'Применяем сохранённые язык, тему и параметры ассистента.',
        'Applying your saved language, theme, and assistant preferences.',
      ),
    },
    {
      key: 'session' as const,
      label: text('Сессия', 'Session'),
      title: text('Подключаем аккаунт', 'Connecting your account'),
      description: text(
        'Безопасно восстанавливаем сессию и проверяем доступ к анализам.',
        'Securely restoring your session and checking analysis access.',
      ),
    },
    {
      key: 'route' as const,
      label: text('Интерфейс', 'Interface'),
      title: text('Открываем рабочее пространство', 'Opening your workspace'),
      description: text(
        'Подготавливаем выбранный раздел и его интерфейс.',
        'Preparing the selected section and its interface.',
      ),
    },
  ];
  const activeStage = stages[activeIndex] ?? stages[0];
  const stageRailStyle = {
    '--startup-progress': `${visualIndex / (phaseOrder.length - 1)}`,
    '--startup-runner-position': `${(visualIndex + 0.5) * (100 / phaseOrder.length)}%`,
  } as CSSProperties;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisualIndex(activeIndex));
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex]);

  useEffect(() => {
    setTakingLonger(false);
    const timeout = window.setTimeout(() => setTakingLonger(true), 7_000);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  return (
    <section
      className="startup-loader"
      aria-labelledby={`startup-loader-title-${activeStage.key}`}
      aria-describedby={`startup-loader-description-${activeStage.key}`}
    >
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {activeStage.title}. {activeStage.description}
        {takingLonger
          ? ` ${text(
              'Этот этап отвечает дольше обычного. Counterpick продолжает безопасную попытку.',
              'This step is taking longer than usual. Counterpick is continuing safely.',
            )}`
          : ''}
      </span>
      <div className="startup-loader__visual" aria-hidden>
        <span className="startup-loader__halo" />
        <span className="startup-loader__orbit" />
        <span className="startup-loader__mark">
          <BrandMark />
        </span>
      </div>
      <div className="startup-loader__copy">
        <span>COUNTERPICK</span>
        <div className="startup-loader__copy-panels">
          {stages.map((stage, index) => (
            <div
              key={stage.key}
              className={`startup-loader__copy-panel ${
                index === activeIndex
                  ? 'startup-loader__copy-panel--active'
                  : index < activeIndex
                    ? 'startup-loader__copy-panel--past'
                    : 'startup-loader__copy-panel--next'
              }`}
              aria-hidden={index !== activeIndex}
            >
              <h1 id={`startup-loader-title-${stage.key}`}>{stage.title}</h1>
              <p id={`startup-loader-description-${stage.key}`}>{stage.description}</p>
            </div>
          ))}
        </div>
        <small
          className={`startup-loader__delay${takingLonger ? ' startup-loader__delay--visible' : ''}`}
          aria-hidden={!takingLonger}
        >
          {text(
            'Этот этап отвечает дольше обычного. Counterpick продолжает безопасную попытку.',
            'This step is taking longer than usual. Counterpick is continuing safely.',
          )}
        </small>
      </div>
      <ol
        className="startup-loader__stages"
        style={stageRailStyle}
        aria-label={text('Этапы запуска', 'Startup stages')}
      >
        <li className="startup-loader__runner" aria-hidden />
        {stages.map((stage, index) => {
          const state = index < activeIndex ? 'complete' : index === activeIndex ? 'active' : 'pending';
          return (
            <li
              key={stage.key}
              className={`startup-loader__stage startup-loader__stage--${state}`}
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <span className="startup-loader__stage-marker" aria-hidden>
                {state === 'complete' ? <CheckIcon size={15} weight="bold" /> : null}
              </span>
              <span>{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
