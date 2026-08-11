import { useCallback, useEffect, useRef, useState } from 'react';

import startupLoaderVideo from '../assets/startup-loader-ping-pong.webm';
import { useI18n } from '../i18n';
import { BrandMark } from './brand-mark';

export type StartupPhase = 'preferences' | 'session' | 'route';

const phaseOrder: StartupPhase[] = ['preferences', 'session', 'route'];
const startupMediaFallbackMs = 12_000;

export function StartupLoader({
  phase,
  onCycleComplete,
}: {
  phase: StartupPhase;
  onCycleComplete?: () => void;
}) {
  const { text } = useI18n();
  const [takingLonger, setTakingLonger] = useState(false);
  const [mediaState, setMediaState] = useState<'loading' | 'ready' | 'error'>('loading');
  const cycleCompleteRef = useRef(false);
  const onCycleCompleteRef = useRef(onCycleComplete);
  const activeIndex = phaseOrder.indexOf(phase);
  const stages = [
    {
      key: 'preferences' as const,
      title: text('Настраиваем Counterpick', 'Preparing Counterpick'),
      description: text(
        'Применяем сохранённые язык, тему и параметры ассистента.',
        'Applying your saved language, theme, and assistant preferences.',
      ),
    },
    {
      key: 'session' as const,
      title: text('Подключаем аккаунт', 'Connecting your account'),
      description: text(
        'Безопасно восстанавливаем сессию и проверяем доступ к анализам.',
        'Securely restoring your session and checking analysis access.',
      ),
    },
    {
      key: 'route' as const,
      title: text('Открываем рабочее пространство', 'Opening your workspace'),
      description: text(
        'Подготавливаем выбранный раздел и его интерфейс.',
        'Preparing the selected section and its interface.',
      ),
    },
  ];
  const activeStage = stages[activeIndex] ?? stages[0];

  const completeCycle = useCallback(() => {
    if (cycleCompleteRef.current) return;
    cycleCompleteRef.current = true;
    onCycleCompleteRef.current?.();
  }, []);

  useEffect(() => {
    onCycleCompleteRef.current = onCycleComplete;
  }, [onCycleComplete]);

  useEffect(() => {
    const timeout = window.setTimeout(completeCycle, startupMediaFallbackMs);
    return () => window.clearTimeout(timeout);
  }, [completeCycle]);

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
      <div className={`startup-loader__media startup-loader__media--${mediaState}`} aria-hidden>
        <span className="startup-loader__media-fallback">
          <BrandMark />
        </span>
        <video
          className="startup-loader__video"
          src={startupLoaderVideo}
          autoPlay
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          onCanPlay={() => setMediaState('ready')}
          onEnded={completeCycle}
          onError={() => {
            setMediaState('error');
            completeCycle();
          }}
        />
        <span className="startup-loader__media-shade" />
      </div>
      <div className="startup-loader__copy">
        <span>COUNTERPICK</span>
        <h1 id={`startup-loader-title-${activeStage.key}`}>{activeStage.title}</h1>
        <p id={`startup-loader-description-${activeStage.key}`}>{activeStage.description}</p>
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
    </section>
  );
}
