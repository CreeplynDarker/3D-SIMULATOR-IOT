import { z } from 'zod';

// The wire contract (spec §10.1). Change it only with a PROTOCOL_VERSION bump, regenerated schema and fixtures, and
// a docs/DECISIONS.md entry (AGENTS.md rule 5).

export const PROTOCOL_VERSION = 1;
export const FeatureKey = z.enum(['a_rms_g', 'cf', 'i_rms_A', 't_C', 'dtdt_C_per_min', 'rpm']);
export const State = z.enum(['OFF', 'CALIBRATING', 'STARTING', 'NORMAL', 'WARNING', 'CRITICAL']);
export const TripReason = z.enum(['RCF', 'I_MAX', 'T_MAX', 'STALL', 'ESTOP']);
export const WarnReason = z.enum(['RCF', 'I_SOFT', 'T_SOFT', 'SENSOR']);

export const Packet = z.object({            // ESP32 → laptop, one per window
  v: z.literal(PROTOCOL_VERSION), kind: z.literal('packet'),
  seq: z.number().int().nonnegative(), ts_ms: z.number().int().nonnegative(), win_ms: z.number().int().positive(),
  a_rms_g: z.number().finite().nonnegative(), cf: z.number().finite().nonnegative(),
  i_rms_A: z.number().finite().nonnegative(), t_C: z.number().finite().nullable(),
  dtdt_C_per_min: z.number().finite().nullable(), rpm: z.number().finite().nonnegative(),
  state: State, relay_ch2: z.enum(['ON', 'OFF']),
  link_lost: z.boolean(), sensor_fault: z.boolean(),
  warn_reason: WarnReason.nullable(), trip_reason: TripReason.nullable(),
});
export const Verdict = z.object({           // laptop → ESP32, one per scored packet
  v: z.literal(PROTOCOL_VERSION), kind: z.literal('verdict'),
  seq_ref: z.number().int().nonnegative(), score: z.number().finite().nonnegative().nullable(),
  threshold: z.number().positive(), alert: z.boolean(), clear: z.boolean(),
  dominant: FeatureKey.nullable(), z: z.partialRecord(FeatureKey, z.number().finite()).nullable(),
  model: z.enum(['UNTRAINED', 'TRAINING', 'READY']),
});
export const Command = z.object({           // operator → ESP32
  v: z.literal(PROTOCOL_VERSION), kind: z.literal('command'),
  seq: z.number().int().nonnegative(), cmd: z.enum(['START', 'RESET', 'ESTOP']),
});

export type FeatureKey = z.infer<typeof FeatureKey>;
export type State = z.infer<typeof State>;
export type TripReason = z.infer<typeof TripReason>;
export type WarnReason = z.infer<typeof WarnReason>;
export type Packet = z.infer<typeof Packet>;
export type Verdict = z.infer<typeof Verdict>;
export type Command = z.infer<typeof Command>;
