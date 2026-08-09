import { z } from 'zod';

export const draftUiEvidenceSchema = z.enum([
  'opposing_team_slots',
  'pick_ban_phase',
  'draft_countdown',
  'draft_mode_label',
  'radiant_dire_draft_labels',
  'lock_in_control',
]);

export const recognitionOutputSchema = z.object({
  selectedCandidate: z.enum(['A', 'B', 'C', 'D', 'none']),
  screenContext: z.enum(['dota_draft', 'not_dota_draft', 'uncertain']),
  draftUiEvidence: z.array(draftUiEvidenceSchema).max(6),
  quality: z.enum(['clear', 'partial', 'not_dota', 'too_blurry']),
  slotInventory: z.array(z.object({
    teamGroup: z.enum(['left', 'right']),
    slot: z.number().int().min(0).max(4),
    state: z.enum(['empty', 'occupied', 'unresolved']),
  })).max(10),
  recognized: z.array(z.object({
    sourceRegion: z.enum([
      'team_pick_slot',
      'hero_selection_grid',
      'hover_preview',
      'recommendation_panel',
      'other',
    ]),
    teamGroup: z.enum(['left', 'right']),
    side: z.enum(['ally', 'enemy', 'unknown']).optional(),
    slot: z.number().int().min(0).max(4),
    heroName: z.string(),
    confidence: z.number().min(0).max(1),
  })).max(10),
});

export const recognitionResponseSchema = z.object({
  quality: z.enum(['clear', 'partial', 'not_dota', 'too_blurry']),
  orientationSource: z.enum([
    'gsi_player_hero',
    'gsi_layout_heuristic',
    'manual_confirmation',
    'explicit_signal',
  ]).optional(),
  detectedPosition: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]).nullable().default(null),
  recognized: z.array(z.object({
    side: z.enum(['ally', 'enemy', 'unknown']),
    visualGroup: z.enum(['left', 'right']).optional(),
    slot: z.number().int().min(0).max(4),
    heroId: z.number().int().positive().nullable(),
    heroName: z.string(),
    localizedName: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    needsReview: z.boolean(),
  })).max(10),
  model: z.string(),
});
