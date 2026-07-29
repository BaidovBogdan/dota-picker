import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

let reducedTransparency = false;
let nativeSubscription: ReturnType<typeof AccessibilityInfo.addEventListener> | null = null;
let initialization = 0;
const listeners = new Set<() => void>();

const publish = (next: boolean) => {
  if (reducedTransparency === next) return;
  reducedTransparency = next;
  listeners.forEach((listener) => listener());
};

const start = () => {
  if (nativeSubscription || Platform.OS === 'web') return;
  const generation = ++initialization;
  void AccessibilityInfo.isReduceTransparencyEnabled()
    .then((next) => {
      if (generation === initialization) publish(next);
    })
    .catch(() => {});
  nativeSubscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', publish);
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

const getSnapshot = () => reducedTransparency;
const getServerSnapshot = () => false;

export function useReducedTransparency() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
