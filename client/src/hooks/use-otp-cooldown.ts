import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useOtpCooldown() {
  const [deadline, setDeadline] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const start = useCallback((seconds: number) => {
    const now = Date.now();
    setCurrentTime(now);
    setDeadline(now + Math.max(0, Math.ceil(seconds)) * 1_000);
  }, []);

  useEffect(() => {
    if (deadline <= Date.now()) return;
    let interval: ReturnType<typeof setInterval>;
    const update = () => {
      const now = Date.now();
      setCurrentTime(now);
      if (now >= deadline) clearInterval(interval);
    };
    interval = setInterval(update, 1_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [deadline]);

  return {
    remainingSeconds: deadline <= currentTime ? 0 : Math.ceil((deadline - currentTime) / 1_000),
    start,
  };
}
