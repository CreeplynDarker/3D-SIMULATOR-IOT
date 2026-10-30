// DS18B20 probe (spec §6.6): first-order thermal lag, a conversion requested every period and readable
// `conversion_s` later, 85 °C on the first conversion, −127 °C while disconnected.
import type { SimConfig } from '../types.ts';

type DsConfig = SimConfig['sensors']['ds18b20'];

export interface Ds18b20State {
  /** Temperature of the steel tip (°C). */
  probe_C: number;
  /** Latest completed reading (°C); the power-on register value until the first conversion completes. */
  reading_C: number;
  /** Number of completed conversions; the firmware sees a new reading when this changes. */
  readings: number;
  /** Sim time (s) the next conversion is requested. */
  nextRequest_s: number;
  /** Sim time (s) the pending conversion completes. */
  due_s: number;
}

/** Probe at `probe_C` (°C); the first conversion is requested at t = 0. */
export function createDs18b20(cfg: DsConfig, probe_C: number): Ds18b20State {
  return { probe_C, reading_C: cfg.powerOn_C, readings: 0, nextRequest_s: cfg.period_s, due_s: cfg.conversion_s };
}

/**
 * Advances the probe to sim time `t_s` (end of a step of `dt_s`), with the motor at `tMotor_C`; completes a pending
 * conversion when due. Times compare with half a step of tolerance.
 */
export function stepDs18b20(
  ds: Ds18b20State,
  cfg: DsConfig,
  tMotor_C: number,
  t_s: number,
  dt_s: number,
  disconnected: boolean,
): void {
  ds.probe_C += ((tMotor_C - ds.probe_C) / cfg.probeTau_s) * dt_s;
  const eps_s = dt_s / 2;
  if (t_s >= ds.due_s - eps_s) {
    if (disconnected) ds.reading_C = cfg.disconnected_C;
    else if (ds.readings === 0) ds.reading_C = cfg.powerOn_C;
    else ds.reading_C = Math.round(ds.probe_C / cfg.resolution_C) * cfg.resolution_C;
    ds.readings++;
    ds.due_s = Infinity;
  }
  if (t_s >= ds.nextRequest_s - eps_s) {
    ds.due_s = ds.nextRequest_s + cfg.conversion_s;
    ds.nextRequest_s += cfg.period_s;
  }
}
