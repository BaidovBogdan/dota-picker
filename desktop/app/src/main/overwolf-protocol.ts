import { z } from 'zod';

export const OVERWOLF_BRIDGE_PROTOCOL_VERSION = 1;
export const OVERWOLF_PAIRING_SCHEME = 'counterpick-overwolf-live';

const timestampSchema = z.number().int().nonnegative();
const teamSchema = z.union([z.literal(2), z.literal(3)]);

const helloMessageSchema = z.object({
  version: z.literal(OVERWOLF_BRIDGE_PROTOCOL_VERSION),
  type: z.literal('hello'),
  sessionToken: z.string().regex(/^[a-f0-9]{64}$/),
  companionVersion: z.string().trim().min(1).max(64),
  extensionId: z.string().trim().min(1).max(160),
  sentAt: timestampSchema,
}).strict();

const heartbeatMessageSchema = z.object({
  version: z.literal(OVERWOLF_BRIDGE_PROTOCOL_VERSION),
  type: z.literal('heartbeat'),
  sequence: z.number().int().nonnegative(),
  sentAt: timestampSchema,
}).strict();

const snapshotMessageSchema = z.object({
  version: z.literal(OVERWOLF_BRIDGE_PROTOCOL_VERSION),
  type: z.literal('snapshot'),
  sequence: z.number().int().nonnegative(),
  sentAt: timestampSchema,
  game: z.object({
    running: z.boolean(),
    matchState: z.string().trim().max(96).nullable(),
    playerTeam: teamSchema.nullable(),
    localHeroId: z.number().int().positive().nullable(),
    localHeroName: z.string().trim().max(96).nullable(),
    localSlot: z.number().int().min(0).max(4).nullable(),
    localPosition: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]).nullable(),
    pseudoMatchId: z.string().trim().max(128).nullable(),
    launchCommandConfigured: z.boolean().nullable(),
  }).strict(),
  draft: z.object({
    picks: z.array(z.object({
      heroId: z.number().int().positive(),
      heroName: z.string().trim().max(96).nullable(),
      team: teamSchema,
      slot: z.number().int().min(0).max(4).nullable(),
      confirmed: z.boolean(),
    }).strict()).max(10),
    bans: z.array(z.number().int().positive()).max(20),
  }).strict(),
}).strict();

const diagnosticMessageSchema = z.object({
  version: z.literal(OVERWOLF_BRIDGE_PROTOCOL_VERSION),
  type: z.literal('diagnostic'),
  level: z.enum(['info', 'warn', 'error']),
  code: z.string().trim().regex(/^[A-Z0-9_]{2,64}$/),
  message: z.string().trim().min(1).max(500),
  sentAt: timestampSchema,
}).strict();

export const overwolfClientMessageSchema = z.discriminatedUnion('type', [
  helloMessageSchema,
  heartbeatMessageSchema,
  snapshotMessageSchema,
  diagnosticMessageSchema,
]);

export type OverwolfClientMessage = z.infer<typeof overwolfClientMessageSchema>;
export type OverwolfSnapshotMessage = z.infer<typeof snapshotMessageSchema>;

export type OverwolfServerMessage =
  | {
      version: typeof OVERWOLF_BRIDGE_PROTOCOL_VERSION;
      type: 'hello-ack';
      serverTime: number;
      heartbeatIntervalMs: number;
    }
  | {
      version: typeof OVERWOLF_BRIDGE_PROTOCOL_VERSION;
      type: 'error';
      code: string;
      message: string;
    };
