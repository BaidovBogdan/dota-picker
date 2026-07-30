import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { AppError } from '../../lib/errors.js';
import type { OpenDotaAdapter } from '../heroes/opendota.adapter.js';
import type { PhotoRecognizer } from './photo-recognizer.js';

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type DraftImageUpload = {
  image: Buffer;
  mimeType: string;
  frameHash: string;
};

function normalizeMultipartError(error: unknown): never {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; statusCode?: unknown };
    const code = candidate.code;
    const statusCode = candidate.statusCode;
    if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE' || statusCode === 406) {
      throw new AppError(
        415,
        'IMAGE_RECOGNITION_FAILED',
        'Content-Type must be multipart/form-data',
      );
    }
    if (statusCode === 400) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Multipart body is invalid');
    }
  }
  throw error;
}

export function validateDraftImage(image: Buffer, mimeType: string) {
  if (!allowedImageTypes.has(mimeType)) {
    throw new AppError(
      415,
      'IMAGE_RECOGNITION_FAILED',
      'Only JPEG, PNG, or WEBP is supported',
    );
  }
  if (image.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Image is empty');
  }

  const matches = mimeType === 'image/jpeg'
    ? image.length >= 3
      && image[0] === 0xff
      && image[1] === 0xd8
      && image[2] === 0xff
    : mimeType === 'image/png'
      ? image.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )
      : image.subarray(0, 4).toString('ascii') === 'RIFF'
        && image.subarray(8, 12).toString('ascii') === 'WEBP';

  if (!matches) {
    throw new AppError(
      415,
      'IMAGE_RECOGNITION_FAILED',
      'Image content does not match its MIME type',
    );
  }
}

export async function readDraftImageUpload(
  request: FastifyRequest,
  maxImageBytes: number,
): Promise<DraftImageUpload> {
  const file = await request.file({
    limits: { files: 1, fields: 0, fileSize: maxImageBytes },
  }).catch(normalizeMultipartError);
  if (file?.fieldname !== 'image') {
    file?.file.resume();
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Multipart field "image" is required',
    );
  }
  if (!allowedImageTypes.has(file.mimetype)) {
    file.file.resume();
    throw new AppError(
      415,
      'IMAGE_RECOGNITION_FAILED',
      'Only JPEG, PNG, or WEBP is supported',
    );
  }

  const image = await file.toBuffer();
  validateDraftImage(image, file.mimetype);
  return {
    image,
    mimeType: file.mimetype,
    frameHash: createHash('sha256').update(image).digest('hex'),
  };
}

export async function recognizeDraftImage(
  upload: DraftImageUpload,
  recognizer: PhotoRecognizer,
  meta: Pick<OpenDotaAdapter, 'getHeroes'>,
) {
  const heroes = await meta.getHeroes();
  return recognizer.recognize(upload.image, upload.mimeType, heroes);
}
