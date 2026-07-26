import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

export const NETWORK_REFRESH_TIMEOUT_MS = 1_500;

export const applyNetworkState = (state: NetInfoState) => {
  const online = Boolean(state.isConnected && state.isInternetReachable !== false);
  onlineManager.setOnline(online);
  return online;
};

export const refreshNetworkState = async () => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), NETWORK_REFRESH_TIMEOUT_MS);
  });
  try {
    const state = await Promise.race([NetInfo.refresh(), deadline]);
    if (!state) {
      onlineManager.setOnline(false);
      return false;
    }
    return applyNetworkState(state);
  } catch {
    onlineManager.setOnline(false);
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
};
