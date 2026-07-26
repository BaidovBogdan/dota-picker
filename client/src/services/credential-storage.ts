import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const memoryStorage = new Map<string, string>();

function getWebStorage() {
  if (typeof globalThis === 'undefined') return null;
  try {
    if (!('localStorage' in globalThis)) return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export async function getCredential(key: string) {
  if (Platform.OS !== 'web') return SecureStore.getItemAsync(key);
  try {
    const storage = getWebStorage();
    if (!storage) return memoryStorage.get(key) ?? null;
    const value = storage.getItem(key);
    if (value !== null) memoryStorage.set(key, value);
    else memoryStorage.delete(key);
    return value;
  } catch {
    return memoryStorage.get(key) ?? null;
  }
}

export async function setCredential(key: string, value: string) {
  if (Platform.OS !== 'web') return SecureStore.setItemAsync(key, value);
  memoryStorage.set(key, value);
  try {
    getWebStorage()?.setItem(key, value);
  } catch {}
}

export async function deleteCredential(key: string) {
  if (Platform.OS !== 'web') return SecureStore.deleteItemAsync(key);
  memoryStorage.delete(key);
  try {
    getWebStorage()?.removeItem(key);
  } catch {}
}
