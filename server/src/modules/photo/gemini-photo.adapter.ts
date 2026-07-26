import {
  GoogleGenAI,
  MediaResolution,
  ThinkingLevel,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { AppError, ExternalServiceError } from '../../lib/errors.js';
import type { HeroMeta } from '../heroes/heroes.types.js';
import type { PhotoRecognizer } from './photo-recognizer.js';
import { recognitionOutputSchema } from './photo.schemas.js';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const recognitionJsonSchema = z.toJSONSchema(recognitionOutputSchema);
Reflect.deleteProperty(recognitionJsonSchema, '$schema');

type GeminiClient = {
  generateContent(parameters: GenerateContentParameters): Promise<GenerateContentResponse>;
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + cost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Number.POSITIVE_INFINITY;
}

export class GeminiPhotoAdapter implements PhotoRecognizer {
  private readonly client: GeminiClient | null;

  public constructor(
    private readonly config: AppConfig['gemini'],
    client?: GeminiClient,
  ) {
    if (client) {
      this.client = client;
      return;
    }
    if (!config.apiKey) {
      this.client = null;
      return;
    }

    const sdk = new GoogleGenAI({
      apiKey: config.apiKey,
      httpOptions: {
        timeout: config.timeoutMs,
        retryOptions: { attempts: 2 },
      },
    });
    this.client = {
      generateContent: async (parameters) => sdk.models.generateContent(parameters),
    };
  }

  public async recognize(image: Buffer, mimeType: string, heroes: HeroMeta[]) {
    if (!allowedMimeTypes.has(mimeType)) {
      throw new AppError(415, 'IMAGE_RECOGNITION_FAILED', 'Unsupported image type');
    }
    if (!this.client) {
      throw new ExternalServiceError('Photo recognition is not configured', {
        missing: 'GEMINI_API_KEY',
      });
    }

    const catalog = heroes.map((hero) => hero.localizedName).join(', ');
    const prompt = [
      'Inspect this Dota 2 draft, match, or hero-selection screenshot.',
      'Identify only hero portraits that are visibly present and never infer hidden picks.',
      "Never assume Radiant is the user's ally team.",
      'Use ally or enemy only when labels, layout, selection highlight, or a player marker makes the side unambiguous.',
      'Use unknown when the side is ambiguous so the user can confirm it.',
      'Slots are zero-based within each side and must be between 0 and 4.',
      'Use quality clear only when every visible portrait is reliably identifiable, partial when only some are reliable, not_dota for unrelated images, and too_blurry when no reliable identification is possible.',
      `Use exact hero names from this catalog: ${catalog}.`,
    ].join(' ');

    try {
      const response = await this.client.generateContent({
        model: this.config.visionModel,
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: image.toString('base64'),
                mimeType,
              },
            },
          ],
        }],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: recognitionJsonSchema,
          maxOutputTokens: 2_048,
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
        },
      });

      if (!response.text) {
        throw new AppError(422, 'IMAGE_RECOGNITION_FAILED', 'The image could not be recognized');
      }

      let output: unknown;
      try {
        output = JSON.parse(response.text);
      } catch {
        throw new AppError(422, 'IMAGE_RECOGNITION_FAILED', 'The recognition response was invalid');
      }

      const parsed = recognitionOutputSchema.safeParse(output);
      if (!parsed.success) {
        throw new AppError(422, 'IMAGE_RECOGNITION_FAILED', 'The recognition response was invalid');
      }

      const indexed = heroes.flatMap((hero) => [
        { key: normalizeName(hero.localizedName), hero },
        { key: normalizeName(hero.name), hero },
      ]);
      const recognized = parsed.data.quality === 'not_dota' || parsed.data.quality === 'too_blurry'
        ? []
        : parsed.data.recognized.map((entry) => {
            const key = normalizeName(entry.heroName);
            const exact = indexed.find((item) => item.key === key)?.hero;
            const fuzzy = indexed.reduce<{ hero: HeroMeta; distance: number } | undefined>(
              (closest, item) => {
                const distance = editDistance(key, item.key);
                return !closest || distance < closest.distance ? { hero: item.hero, distance } : closest;
              },
              undefined,
            );
            const hero = exact ?? (fuzzy && fuzzy.distance <= 2 ? fuzzy.hero : undefined);
            return {
              side: entry.side,
              slot: entry.slot,
              heroId: hero?.id ?? null,
              heroName: entry.heroName,
              localizedName: hero?.localizedName ?? null,
              confidence: entry.confidence,
              needsReview: entry.confidence < 0.82 || !hero || entry.side === 'unknown',
            };
          });

      return {
        quality: parsed.data.quality,
        recognized,
        model: response.modelVersion ?? this.config.visionModel,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new ExternalServiceError('Photo recognition is temporarily unavailable', {
        provider: 'Gemini',
      });
    }
  }
}
