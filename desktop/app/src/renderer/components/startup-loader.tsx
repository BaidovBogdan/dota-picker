import { CheckIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { useI18n } from '../i18n';
import { BrandMark } from './brand-mark';

export type StartupPhase = 'preferences' | 'session' | 'route';

const phaseOrder: StartupPhase[] = ['preferences', 'session', 'route'];

export function StartupLoader({ phase }: { phase: StartupPhase }) {
  const { text } = useI18n();
  const [takingLonger, setTakingLonger] = useState(false);
  const activeIndex = phaseOrder.indexOf(phase);
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

  useEffect(() => {
    setTakingLonger(false);
    const timeout = window.setTimeout(() => setTakingLonger(true), 7_000);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  return (
    <section
      className="startup-loader"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-labelledby="startup-loader-title"
      aria-describedby="startup-loader-description"
    >
      <div className="startup-loader__visual" aria-hidden>
        <span className="startup-loader__halo" />
        <span className="startup-loader__orbit" />
        <span className="startup-loader__mark">
          <BrandMark />
        </span>
      </div>
      <div className="startup-loader__copy">
        <span>COUNTERPICK</span>
        <h1 id="startup-loader-title">{activeStage.title}</h1>
        <p id="startup-loader-description">{activeStage.description}</p>
        {takingLonger ? (
          <small className="startup-loader__delay">
            {text(
              'Этот этап отвечает дольше обычного. Counterpick продолжает безопасную попытку.',
              'This step is taking longer than usual. Counterpick is continuing safely.',
            )}
          </small>
        ) : null}
      </div>
      <ol
        className="startup-loader__stages"
        aria-label={text('Этапы запуска', 'Startup stages')}
      >
        {stages.map((stage, index) => {
          const state = index < activeIndex ? 'complete' : index === activeIndex ? 'active' : 'pending';
          return (
            <li
              key={stage.key}
              className={`startup-loader__stage startup-loader__stage--${state}`}
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <span className="startup-loader__stage-marker" aria-hidden>
                {state === 'complete' ? <CheckIcon size={11} weight="bold" /> : null}
              </span>
              <span>{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
