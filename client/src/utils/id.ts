import * as Crypto from 'expo-crypto';

export const createId = (prefix: string) => `${prefix}_${Crypto.randomUUID()}`;
