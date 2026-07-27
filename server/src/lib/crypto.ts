import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function createOpaqueToken() {
  return randomBytes(48).toString('base64url');
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function secureEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function stableStringify(value: unknown): string {
  if (value === undefined) {
    return '"__undefined__"';
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(',')}}`;
  }

  if (typeof value === 'bigint') {
    return `"${value}n"`;
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return JSON.stringify(String(value));
  }
  return JSON.stringify(value);
}
