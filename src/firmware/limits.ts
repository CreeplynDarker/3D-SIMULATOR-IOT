// Local limits and flags (spec §7.3), evaluated at each window end. Trips are acted on by the state machine; flags
// (sensor_fault, link_lost) are reported in every packet.
import type { State } from '../shared/protocol.ts';
import type { SimConfig } from '../sim/types.ts';

export type TripLimit = 'I_MAX' | 'T_MAX' | 'STALL';
export type SoftLimit = 'I_SOFT' | 'T_SOFT' | 'SENSOR';

export interface LimitState {
  /** Consecutive windows over iMax (NORMAL/WARNING). */
  iOverRun: number;
  /** Consecutive windows under the stall speed (NORMAL/WARNING). */
  stallRun: number;
  sensorFault: boolean;
  linkLost: boolean;
  /** Sim time of the last verdict received, or of the START that began the run (s). */
  lastVerdict_s: number;
}

/** What one window end gives the limits: state, features and the age of the temperature. */
export interface LimitInput {
  state: State;
  tEnd_s: number;
  i_rms_A: number;
  rpm: number;
  /** Last valid DS18B20 reading (°C), or null if none since boot. */
  t_C: number | null;
  /** Sim time of the last valid reading, or boot time (s). */
  lastValidTemp_s: number;
}

export interface LimitResult {
  trip: TripLimit | null;
  soft: SoftLimit | null;
  sensorFault: boolean;
  linkLost: boolean;
  sensorChanged: boolean;
  linkChanged: boolean;
}

const RUNNING: readonly State[] = ['STARTING', 'NORMAL', 'WARNING'];
const SUPERVISED: readonly State[] = ['NORMAL', 'WARNING'];

/** Limits at boot (sim time `t0_s`). */
export function createLimits(t0_s: number): LimitState {
  return { iOverRun: 0, stallRun: 0, sensorFault: false, linkLost: false, lastVerdict_s: t0_s };
}

/** Records a received verdict at `t_s`; returns true if it restores a lost link. */
export function noteVerdict(ls: LimitState, t_s: number): boolean {
  ls.lastVerdict_s = t_s;
  const restored = ls.linkLost;
  ls.linkLost = false;
  return restored;
}

/** Restarts the link timer when a run begins (START), so time spent OFF does not count as loss. */
export function resetLinkTimer(ls: LimitState, t_s: number): void {
  ls.lastVerdict_s = t_s;
  ls.linkLost = false;
}

function tripOf(ls: LimitState, x: LimitInput, cfg: SimConfig): TripLimit | null {
  const fw = cfg.firmware;
  const supervised = SUPERVISED.includes(x.state);
  ls.iOverRun = supervised && x.i_rms_A > fw.iMax_A ? ls.iOverRun + 1 : 0;
  ls.stallRun = supervised && x.rpm < fw.stallFraction * cfg.fan.rpmRated ? ls.stallRun + 1 : 0;
  if (ls.iOverRun >= fw.nILimit || (x.state === 'STARTING' && x.i_rms_A > fw.iMaxStart_A)) return 'I_MAX';
  if (RUNNING.includes(x.state) && x.t_C !== null && x.t_C > fw.tMax_C) return 'T_MAX';
  if (ls.stallRun >= fw.nStall) return 'STALL';
  return null;
}

/** Evaluates every §7.3 row for one window end; updates the counters and flags in `ls`. */
export function evaluateLimits(ls: LimitState, x: LimitInput, cfg: SimConfig): LimitResult {
  const fw = cfg.firmware;
  const trip = tripOf(ls, x, cfg);

  const sensorFault = x.tEnd_s - x.lastValidTemp_s > fw.sensorFaultTimeout_s;
  const sensorChanged = sensorFault !== ls.sensorFault;
  ls.sensorFault = sensorFault;

  const wasLost = ls.linkLost;
  if (RUNNING.includes(x.state) && x.tEnd_s - ls.lastVerdict_s > cfg.link.lossTimeout_s) {
    ls.linkLost = true; // @map link.lost
  }

  let soft: SoftLimit | null = null;
  if (x.i_rms_A > fw.iWarnFraction * fw.iMax_A) soft = 'I_SOFT';
  else if (x.t_C !== null && x.t_C > fw.tMax_C - fw.tWarnMargin_C) soft = 'T_SOFT';
  else if (sensorFault) soft = 'SENSOR';

  return { trip, soft, sensorFault, linkLost: ls.linkLost, sensorChanged, linkChanged: ls.linkLost !== wasLost };
}
