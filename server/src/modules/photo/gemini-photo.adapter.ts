import {
  GoogleGenAI,
  PartMediaResolutionLevel,
  ThinkingLevel,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { AppError, ExternalServiceError } from '../../lib/errors.js';
import type { HeroMeta } from '../heroes/heroes.types.js';
import {
  processDraftVisionImage,
} from './draft-pick-bar.js';
import { recognizeDraftWithPortraitIndex } from './local-portrait-recognizer.js';
import type { PhotoRecognitionOptions, PhotoRecognizer } from './photo-recognizer.js';
import { recognitionOutputSchema } from './photo.schemas.js';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_VISION_REQUEST_MS = 15_000;
const AUTO_ACCEPT_CONFIDENCE = 0.91;
const recognitionJsonSchema = z.toJSONSchema(recognitionOutputSchema);
Reflect.deleteProperty(recognitionJsonSchema, '$schema');
const strongDraftUiEvidence = new Set([
  'opposing_team_slots',
  'pick_ban_phase',
]);
const visualGroupOrder = {
  left: 0,
  right: 1,
} as const;
const completeVisualSlotKeys = new Set(
  (['left', 'right'] as const).flatMap((teamGroup) => (
    Array.from({ length: 5 }, (_value, slot) => `${teamGroup}:${slot}`)
  )),
);

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
    private readonly config: Pick<AppConfig['gemini'], 'apiKey' | 'visionModel' | 'timeoutMs'>,
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
        timeout: Math.min(config.timeoutMs, MAX_VISION_REQUEST_MS),
        retryOptions: { attempts: 1 },
      },
    });
    this.client = {
      generateContent: async (parameters) => sdk.models.generateContent(parameters),
    };
  }

  public async recognize(
    image: Buffer,
    mimeType: string,
    heroes: HeroMeta[],
    options?: PhotoRecognitionOptions,
  ) {
    if (!allowedMimeTypes.has(mimeType)) {
      throw new AppError(415, 'IMAGE_RECOGNITION_FAILED', 'Unsupported image type');
    }
    const { visionInput, localRecognition } = await processDraftVisionImage(
      image,
      async (prepared) => ({
        visionInput: prepared,
        localRecognition: await recognizeDraftWithPortraitIndex(
          prepared,
          heroes,
          options?.allyGroup
            ? {
              allyGroup: options.allyGroup,
              ...(options.orientationSource
                ? { orientationSource: options.orientationSource }
                : {}),
            }
            : undefined,
        ),
      }),
    );
    if (localRecognition) return localRecognition;
    if (!this.client) {
      throw new ExternalServiceError('Photo recognition is not configured', {
        missing: 'GEMINI_API_KEY',
      });
    }

    const catalog = heroes.map((hero) => hero.localizedName).join(', ');
    const candidateSummary = visionInput.candidates
      .map((candidate) => (
        `${candidate.id}: ${candidate.strategy}, vertical source range `
        + `${Math.round(candidate.sourceTopRatio * 100)}-${Math.round(candidate.sourceBottomRatio * 100)}%`
      ))
      .join('; ');
    const prompt = [
      `The server extracted ${visionInput.candidates.length} horizontal candidate region(s) from a ${visionInput.sourceKind} image: ${candidateSummary}.`,
      'Each following image is preceded by its candidate letter. Candidate regions can overlap.',
      'Select exactly one candidate with the strongest official Dota 2 hero-pick or draft-phase evidence, or select none.',
      'Return detections only from selectedCandidate. Never merge or duplicate detections across candidates.',
      'A candidate can be a direct narrow pick-bar screenshot, the top of a full screenshot, or a horizontal band from a camera photo of a monitor.',
      'First classify whether the selected candidate comes from the official Dota 2 game client hero-pick or draft-phase interface.',
      'Set screenContext to dota_draft only when at least two independent draft UI signals from draftUiEvidence are directly visible, including opposing_team_slots or pick_ban_phase.',
      'A centered countdown together with ALL PICK or PICK PHASE and opposing player-slot rows is conclusive draft structure, even if a recording playback control overlaps one corner.',
      'Some candidate bands can contain the central hero-selection grid. It must never be treated as pick evidence.',
      'A hero portrait, Dota logo, the words Dota or draft, five generic cards, or Dota-themed artwork are never draft UI evidence by themselves.',
      'Companion apps, websites, dashboards, Counterpick screens, hero lists, guides, result cards, post-match screens, and the live-match HUD are not Dota draft screens even when they contain real hero portraits.',
      'Use not_dota_draft for those excluded screens and uncertain when the required structural evidence is not clearly visible.',
      'When screenContext is not dota_draft, set quality to not_dota and return an empty recognized array.',
      'Recognize picks only from occupied team pick slots in the draft interface, usually the opposing team bars at the top or sides.',
      'Return slotInventory separately from recognized hero identities.',
      'For a standard two-group draft bar, slotInventory must contain all ten unique visual slots: left 0-4 and right 0-4.',
      'Mark a slot empty only when it visibly has no hero artwork, occupied when hero artwork is present and identifiable, and unresolved when artwork is present but identity or occupancy is uncertain.',
      'Never omit an occupied or unresolved slot from slotInventory, even when the hero identity is ambiguous and omitted from recognized.',
      'For every returned team pick slot, return its visual teamGroup as left or right when the centered divider and group layout are visible.',
      'teamGroup describes only screen geometry and never means ally or enemy by itself.',
      'An occupied team slot contains hero artwork. Rank medals, rank numbers, player avatars, player names, role labels, empty banners, and profile decorations inside an unpicked player card are not heroes.',
      'If only two of five cards on one side contain hero artwork, return only those two occupied picks.',
      'Hero cosmetics can change colors and headgear. Use distinctive face, anatomy, and silhouette rather than dominant color.',
      'When a cosmetic portrait is ambiguous between multiple heroes, omit that slot instead of guessing or returning a visual lookalike.',
      'Never return portraits from the central hero-selection grid, attribute rows, hover preview, recommendation panel, friends-and-foes panel, ads, artwork, or background.',
      'Set sourceRegion to team_pick_slot only when the portrait is visibly inside an occupied team pick slot; otherwise use the matching non-slot sourceRegion.',
      'Slots are zero-based within each team pick bar in visual order from left to right or top to bottom.',
      'Identify only picks that are visibly present and never infer hidden picks.',
      "Never assume Radiant, Dire, the left group, or the right group is the user's ally team.",
      'Do not infer player-relative ally or enemy ownership; if the optional side field is emitted, set it to unknown.',
      'The server maps visual teamGroup to the trusted local-player team signal when one is available.',
      'Use quality clear only when every visible portrait is reliably identifiable, partial when only some are reliable, not_dota for unrelated images, and too_blurry when no reliable identification is possible.',
      `Use exact hero names from this catalog: ${catalog}.`,
    ].join(' ');
    const imageParts = visionInput.candidates.flatMap((candidate) => [
      { text: `Candidate ${candidate.id}` },
      {
        inlineData: {
          data: candidate.image.toString('base64'),
          mimeType: candidate.mimeType,
        },
        mediaResolution: {
          level: candidate.reliability === 'low'
            ? PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM
            : PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
        },
      },
    ]);

    try {
      const response = await this.client.generateContent({
        model: this.config.visionModel,
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            ...imageParts,
          ],
        }],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: recognitionJsonSchema,
          maxOutputTokens: 768,
          seed: 17,
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
      const selectedCandidate = visionInput.candidates.find(
        (candidate) => candidate.id === parsed.data.selectedCandidate,
      );
      const evidence = new Set(parsed.data.draftUiEvidence);
      const isConfirmedDraft = Boolean(selectedCandidate)
        && parsed.data.screenContext === 'dota_draft'
        && evidence.size >= 2
        && [...evidence].some((item) => strongDraftUiEvidence.has(item));
      const baseQuality: z.infer<typeof recognitionOutputSchema>['quality'] = parsed.data.quality === 'too_blurry'
        ? 'too_blurry'
        : isConfirmedDraft && parsed.data.quality !== 'not_dota'
          ? parsed.data.quality
          : 'not_dota';
      const indexed = heroes.flatMap((hero) => [
        { key: normalizeName(hero.localizedName), hero },
        { key: normalizeName(hero.name), hero },
      ]);
      const exactHeroByName = new Map<string, HeroMeta>();
      for (const item of indexed) {
        if (!exactHeroByName.has(item.key)) {
          exactHeroByName.set(item.key, item.hero);
        }
      }
      const bestByPosition = new Map<string, {
        entry: z.infer<typeof recognitionOutputSchema>['recognized'][number];
        visualGroup: 'left' | 'right';
        resolvedSide: 'ally' | 'enemy' | 'unknown';
        hero: HeroMeta | undefined;
        heroKey: string | undefined;
        matchedExactly: boolean;
      }>();
      const duplicatePositions = new Set<string>();
      const confidenceCeiling = selectedCandidate?.reliability === 'high'
        ? 0.93
        : selectedCandidate?.reliability === 'medium'
          ? 0.84
          : 0.75;

      if (baseQuality !== 'not_dota' && baseQuality !== 'too_blurry') {
        for (const entry of parsed.data.recognized) {
          if (entry.sourceRegion !== 'team_pick_slot') continue;

          const key = normalizeName(entry.heroName);
          const exact = exactHeroByName.get(key);
          const fuzzy = exact
            ? undefined
            : indexed.reduce<{ hero: HeroMeta; distance: number } | undefined>(
                (closest, item) => {
                  const distance = editDistance(key, item.key);
                  return !closest || distance < closest.distance
                    ? { hero: item.hero, distance }
                    : closest;
                },
                undefined,
              );
          const hero = exact ?? (fuzzy && fuzzy.distance <= 2 ? fuzzy.hero : undefined);
          const heroKey = hero ? `id:${hero.id}` : key ? `name:${key}` : undefined;
          const resolvedSide = options?.allyGroup
            ? entry.teamGroup === options.allyGroup ? 'ally' as const : 'enemy' as const
            : 'unknown' as const;
          const positionKey = `${entry.teamGroup}:${entry.slot}`;
          const existing = bestByPosition.get(positionKey);

          if (existing) duplicatePositions.add(positionKey);
          if (!existing || entry.confidence > existing.entry.confidence) {
            bestByPosition.set(positionKey, {
              entry: {
                ...entry,
                confidence: Math.min(entry.confidence, confidenceCeiling),
              },
              visualGroup: entry.teamGroup,
              resolvedSide,
              hero,
              heroKey,
              matchedExactly: Boolean(exact),
            });
          }
        }
      }

      const positionsByHero = new Map<string, Set<string>>();
      for (const [positionKey, candidate] of bestByPosition) {
        if (!candidate.heroKey) continue;
        const positions = positionsByHero.get(candidate.heroKey) ?? new Set<string>();
        positions.add(positionKey);
        positionsByHero.set(candidate.heroKey, positions);
      }
      const conflictingHeroes = new Set(
        [...positionsByHero]
          .filter(([, positions]) => positions.size > 1)
          .map(([heroKey]) => heroKey),
      );
      const normalizedRecognized = [...bestByPosition]
        .map(([positionKey, candidate]) => ({
          side: candidate.resolvedSide,
          visualGroup: candidate.visualGroup,
          slot: candidate.entry.slot,
          heroId: candidate.hero?.id ?? null,
          heroName: candidate.entry.heroName,
          localizedName: candidate.hero?.localizedName ?? null,
          confidence: candidate.entry.confidence,
          needsReview: baseQuality !== 'clear'
            || candidate.entry.confidence < AUTO_ACCEPT_CONFIDENCE
            || !candidate.hero
            || !candidate.matchedExactly
            || candidate.resolvedSide === 'unknown'
            || selectedCandidate?.reliability !== 'high'
            || selectedCandidate.enhanced
            || duplicatePositions.has(positionKey)
            || Boolean(candidate.heroKey && conflictingHeroes.has(candidate.heroKey)),
        }))
        .sort((left, right) => (
          visualGroupOrder[left.visualGroup] - visualGroupOrder[right.visualGroup]
          || left.slot - right.slot
          || (left.heroId ?? Number.MAX_SAFE_INTEGER) - (right.heroId ?? Number.MAX_SAFE_INTEGER)
        ));
      const hasNonSlotDetection = parsed.data.recognized.some(
        (entry) => entry.sourceRegion !== 'team_pick_slot',
      );
      const inventoryKeys = parsed.data.slotInventory.map(
        (entry) => `${entry.teamGroup}:${entry.slot}`,
      );
      const uniqueInventoryKeys = new Set(inventoryKeys);
      const inventoryComplete = inventoryKeys.length === completeVisualSlotKeys.size
        && uniqueInventoryKeys.size === completeVisualSlotKeys.size
        && [...completeVisualSlotKeys].every((key) => uniqueInventoryKeys.has(key));
      const unresolvedInventory = parsed.data.slotInventory.some(
        (entry) => entry.state === 'unresolved',
      );
      const occupiedKeys = new Set(parsed.data.slotInventory
        .filter((entry) => entry.state === 'occupied')
        .map((entry) => `${entry.teamGroup}:${entry.slot}`));
      const recognizedKeys = new Set(normalizedRecognized.map(
        (entry) => `${entry.visualGroup}:${entry.slot}`,
      ));
      const occupancyMatchesRecognized = inventoryComplete
        && !unresolvedInventory
        && occupiedKeys.size === recognizedKeys.size
        && [...occupiedKeys].every((key) => recognizedKeys.has(key));
      const quality: z.infer<typeof recognitionOutputSchema>['quality'] = baseQuality === 'clear'
        && (
          hasNonSlotDetection
          || normalizedRecognized.length === 0
          || !occupancyMatchesRecognized
          || duplicatePositions.size > 0
          || conflictingHeroes.size > 0
          || normalizedRecognized.some((entry) => entry.needsReview)
        )
        ? 'partial'
        : baseQuality;
      return {
        quality,
        ...(options?.allyGroup
          ? { orientationSource: options.orientationSource ?? 'explicit_signal' as const }
          : {}),
        detectedPosition: null,
        recognized: normalizedRecognized,
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
