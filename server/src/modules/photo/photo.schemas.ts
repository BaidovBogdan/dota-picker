import { z } from 'zod';

export const draftUiEvidenceSchema = z.enum([
  'opposing_team_slots',
  'pick_ban_phase',
  'draft_countdown',
  'draft_mode_label',
  'radiant_dire_draft_labels',
  'lock_in_control',
]);

const playerRoleLabelSchema = z.enum([
  'safe_lane',
  'mid_lane',
  'off_lane',
  'soft_support',
  'support',
  'hard_support',
]);

export const positionDetectionOutputSchema = z.object({
  cards: z.array(z.object({
    teamGroup: z.enum(['left', 'right']),
    slot: z.number().int().min(0).max(4),
    playerNameVisible: z.boolean(),
    roleLabel: playerRoleLabelSchema,
    confidence: z.number().min(0).max(1),
  })).max(10),
});

export const recognitionOutputSchema = z.object({
  selectedCandidate: z.enum(['A', 'B', 'C', 'D', 'none']),
  screenContext: z.enum(['dota_draft', 'not_dota_draft', 'uncertain']),
  draftUiEvidence: z.array(draftUiEvidenceSchema).max(6),
  quality: z.enum(['clear', 'partial', 'not_dota', 'too_blurry']),
  recognized: z.array(z.object({
    sourceRegion: z.enum([
      'team_pick_slot',
      'hero_selection_grid',
      'hover_preview',
      'recommendation_panel',
      'other',
    ]),
    side: z.enum(['ally', 'enemy', 'unknown']),
    slot: z.number().int().min(0).max(4),
    heroName: z.string(),
    confidence: z.number().min(0).max(1),
  })).max(10),
});

export const recognitionResponseSchema = z.object({
  quality: z.enum(['clear', 'partial', 'not_dota', 'too_blurry']),
  detectedPosition: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]).nullable().default(null),
  recognized: z.array(z.object({
    side: z.enum(['ally', 'enemy', 'unknown']),
    slot: z.number().int().min(0).max(4),
    heroId: z.number().int().positive().nullable(),
    heroName: z.string(),
    localizedName: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    needsReview: z.boolean(),
  })).max(10),
  model: z.string(),
});
