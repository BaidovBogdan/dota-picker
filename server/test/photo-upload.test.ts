import { describe, expect, it } from 'vitest';
import { AppError } from '../src/lib/errors.js';
import { validateDraftImage } from '../src/modules/photo/photo-upload.js';

describe('draft image validation', () => {
  it.each([
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff])],
    [
      'image/png',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    [
      'image/webp',
      Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    ],
  ])('accepts a matching %s signature', (mimeType, image) => {
    expect(() => validateDraftImage(image, mimeType)).not.toThrow();
  });

  it('rejects empty, unsupported, and mismatched image data', () => {
    for (const [image, mimeType, status] of [
      [Buffer.alloc(0), 'image/png', 400],
      [Buffer.from('image'), 'image/gif', 415],
      [Buffer.from('not-a-png'), 'image/png', 415],
    ] as const) {
      try {
        validateDraftImage(image, mimeType);
        throw new Error('Expected validation to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).statusCode).toBe(status);
      }
    }
  });
});
