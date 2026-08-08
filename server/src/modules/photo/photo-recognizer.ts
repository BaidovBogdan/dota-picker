import type { z } from 'zod';
import type { HeroMeta } from '../heroes/heroes.types.js';
import type { recognitionResponseSchema } from './photo.schemas.js';

export type PhotoRecognitionResult = z.infer<typeof recognitionResponseSchema>;

export type PhotoRecognitionOptions = {
  detectPosition?: boolean;
  allyGroup?: 'left' | 'right';
  orientationSource?: 'gsi_layout_heuristic' | 'manual_confirmation';
};

export type PhotoRecognizer = {
  recognize(
    image: Buffer,
    mimeType: string,
    heroes: HeroMeta[],
    options?: PhotoRecognitionOptions,
  ): Promise<PhotoRecognitionResult>;
};
