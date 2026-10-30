// Fault injection (spec §6.9): steps apply on the next plant step, ramps move linearly in sim time, every change
// emits a FAULT_SET event.
import type { FaultKey, FaultValues, NumericFaultKey, SimEvent } from '../shared/messages.ts';

interface Ramp {
  from: number;
  to: number;
  t0_s: number;
  ramp_s: number;
}

export interface FaultState {
  values: FaultValues;
  ramps: Partial<Record<NumericFaultKey, Ramp>>;
}

export type EmitEvent = (event: SimEvent) => void;

/** Every fault off: numeric keys 0, the DS18B20 disconnect switch false. */
export function createFaults(): FaultState {
  return {
    values: {
      imbalance_g: 0,
      looseness: 0,
      friction: 0,
      overheat: 0,
      supplySag_V: 0,
      packetLoss: 0,
      ds18b20Disconnect: false,
    },
    ramps: {},
  };
}

/**
 * Sets fault `key` at sim time `t_s` (s). Numeric keys step to `value` at once (`ramp_s` = 0) or move linearly over
 * `ramp_s` seconds from their current value; the disconnect switch always steps.
 */
export function setFault(
  f: FaultState,
  key: FaultKey,
  value: number | boolean,
  ramp_s: number,
  t_s: number,
  emit: EmitEvent,
): void {
  if (key === 'ds18b20Disconnect') {
    f.values.ds18b20Disconnect = Boolean(value);
    emit({ t_s, type: 'FAULT_SET', detail: `${key}=${f.values.ds18b20Disconnect}` });
    return;
  }
  const to = Number(value);
  delete f.ramps[key];
  if (ramp_s > 0) f.ramps[key] = { from: f.values[key], to, t0_s: t_s, ramp_s };
  else f.values[key] = to;
  emit({ t_s, type: 'FAULT_SET', detail: ramp_s > 0 ? `${key}=${to} ramp ${ramp_s} s` : `${key}=${to}` });
}

/** Turns every fault off immediately and cancels ramps. */
export function clearFaults(f: FaultState, t_s: number, emit: EmitEvent): void {
  const off = createFaults();
  f.values = off.values;
  f.ramps = off.ramps;
  emit({ t_s, type: 'FAULT_SET', detail: 'clearAll' });
}

/** Moves ramped faults to their value at sim time `t_s` (s); finished ramps land exactly on their target. */
export function stepFaults(f: FaultState, t_s: number): void {
  for (const key of Object.keys(f.ramps) as NumericFaultKey[]) {
    const r = f.ramps[key];
    if (!r) continue;
    const k = (t_s - r.t0_s) / r.ramp_s;
    if (k >= 1) {
      f.values[key] = r.to;
      delete f.ramps[key];
    } else {
      f.values[key] = r.from + (r.to - r.from) * Math.max(0, k);
    }
  }
}
