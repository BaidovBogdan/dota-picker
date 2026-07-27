import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

let reducedMotion = true;
let nativeSubscription: ReturnType<typeof AccessibilityInfo.addEventListener> | null = null;
let initialization = 0;
const listeners = new Set<() => void>();

const publish = (next: boolean) => {
  if (reducedMotion === next) return;
  reducedMotion = next;
  listeners.forEach((listener) => listener());
};

const start = () => {
  if (nativeSubscription) return;
  const generation = ++initialization;
  void AccessibilityInfo.isReduceMotionEnabled()
    .then((next) => {
      if (generation === initialization) publish(next);
    })
    .catch(() => {});
  nativeSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', publish);
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    initialization += 1;
    nativeSubscription?.remove();
    nativeSubscription = null;
  };
};

const getSnapshot = () => reducedMotion;
const getServerSnapshot = () => true;

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
