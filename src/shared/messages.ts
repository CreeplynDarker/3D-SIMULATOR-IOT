import type { Config } from './config.ts';
import type { Command, Packet, State, TripReason, Verdict } from './protocol.ts';

// Worker message shapes (spec §10.2). Every message is a plain object discriminated by `type`.

/** Fault keys from spec §6.9; all are numeric except the DS18B20 disconnect switch. */
export type NumericFaultKey = 'imbalance_g' | 'looseness' | 'friction' | 'overheat' | 'supplySag_V' | 'packetLoss';
export type FaultKey = NumericFaultKey | 'ds18b20Disconnect';
export type FaultValues = Record<NumericFaultKey, number> & { ds18b20Disconnect: boolean };

/** Harness and UI event types (spec §10.4). */
export const SIM_EVENT_TYPES = [
  'FAULT_SET',
  'START',
  'CALIBRATED',
  'NORMAL',
  'ALERT',
  'WARNING',
  'CRITICAL',
  'RELAY_OPEN',
  'RELAY_CLOSED',
  'RESET',
  'LINK_LOST',
  'LINK_RESTORED',
  'SENSOR_FAULT',
  'SENSOR_OK',
  'REFUSED',
] as const;
export type SimEventType = (typeof SIM_EVENT_TYPES)[number];

/** A timestamped event; `t_s` is sim time in seconds. */
export interface SimEvent {
  t_s: number;
  type: SimEventType;
  detail?: string;
}

/** Plant + firmware state sent to the UI at most `ui.snapshotHz` times per second. */
export interface Snapshot {
  t_s: number;
  rpm: number;
  omega_radps: number;
  theta_rad: number;
  fanV_V: number;
  current_A: number;
  tMotor_C: number;
  tProbe_C: number;
  coilOn: boolean;
  contact: 'NC' | 'NO';
  gpio26: 0 | 1;
  state: State;
  faults: FaultValues;
  accel_g: [number, number, number];
  acsOut_V: number;
  adcPin_V: number;
  adcCounts: number;
  dsReading_C: number;
  tachHigh: boolean;
  alertRun: number;
  nCritical: number;
  linkLost: boolean;
  sensorFault: boolean;
  tripReason: TripReason | null;
  activeMap: string | null;
  lagging: boolean;
}

/** Main → sim worker. `connect` hands over the sim end of the "Wi-Fi" MessageChannel. */
export type MainToSim =
  | { type: 'init'; config: Config; seed: number; warmStart: boolean }
  | { type: 'connect'; port: MessagePort }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'speed'; x: number }
  | { type: 'reset' }
  | { type: 'fault'; key: FaultKey; value: number | boolean; ramp_s: number }
  | { type: 'clearFaults' }
  | { type: 'command'; command: Command }
  | { type: 'scenario'; id: string }
  | { type: 'raw'; on: boolean }
  | { type: 'ping'; id: number };

/** Sim worker → main. `raw` buffers are transferred, not copied; `scenario` reports a script's start and end. */
export type SimToMain =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'packet'; packet: Packet }
  | { type: 'verdictIn'; verdict: Verdict }
  | { type: 'log'; line: string }
  | { type: 'event'; event: SimEvent }
  | { type: 'raw'; ax: Float32Array; ay: Float32Array; az: Float32Array }
  | { type: 'scenario'; id: string; done: boolean }
  | { type: 'pong'; id: number };

/** Sim → RCF over the MessageChannel ("Wi-Fi" uplink). */
export type SimToRcf = { type: 'packet'; packet: Packet };
/** RCF → sim over the MessageChannel ("Wi-Fi" downlink). */
export type RcfToSim = { type: 'verdict'; verdict: Verdict };

/** Main → RCF worker. `connect` hands over the RCF end of the MessageChannel. */
export type MainToRcf =
  | { type: 'connect'; port: MessagePort }
  | { type: 'loadModel'; json: string }
  | { type: 'train' }
  | { type: 'setThreshold'; x: number }
  | { type: 'ping'; id: number };

export type ModelStatus = Verdict['model'];

/** RCF worker → main. `verdict` is a copy for the UI; `progress` is 0…1. */
export type RcfToMain =
  | { type: 'modelStatus'; status: ModelStatus; progress: number; reason?: string }
  | { type: 'verdict'; verdict: Verdict }
  | { type: 'pong'; id: number };
