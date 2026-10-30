// Window features (spec §7.2), computed by the firmware at each window end from what it sampled.
import type { SimConfig } from '../sim/types.ts';
import type { DsRead, WindowData } from './sampler.ts';

/** Floor under a per-axis RMS so a flat axis gives CF 0 instead of 0/0 (spec §7.2). */
const CF_RMS_FLOOR_g = 1e-6;

export interface WindowFeatures {
  a_rms_g: number;
  cf: number;
  i_rms_A: number;
  rpm: number;
}

/** Calibrated current (A) for a raw ADC reading, given the zero-current reading `counts0`. */
export function currentFromCounts_A(counts: number, counts0: number, cfg: SimConfig): number {
  const { adc, divider, acs712 } = cfg.sensors;
  const volts = (counts - counts0) * (adc.vSpan_V / adc.maxCount);
  return (volts * ((divider.rTop_ohm + divider.rBottom_ohm) / divider.rBottom_ohm)) / acs712.sens_VperA;
}

/** Vibration, current and speed features of one window; `counts0` is the calibrated zero (counts). */
export function computeFeatures(w: WindowData, counts0: number, cfg: SimConfig): WindowFeatures {
  const n = w.n;
  const axes = [w.ax_g, w.ay_g, w.az_g];
  let sumSq = 0;
  let cf = 0;
  for (const a of axes) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += a[i] as number;
    mean /= n;
    let ss = 0;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const d = (a[i] as number) - mean;
      ss += d * d;
      peak = Math.max(peak, Math.abs(d));
    }
    sumSq += ss;
    cf = Math.max(cf, peak / Math.max(CF_RMS_FLOOR_g, Math.sqrt(ss / n))); // @map feat.cf
  }
  const a_rms_g = Math.sqrt(sumSq / n); // @map feat.arms
  let iSq = 0;
  for (let i = 0; i < n; i++) iSq += currentFromCounts_A(w.counts[i] as number, counts0, cfg) ** 2;
  const i_rms_A = Math.sqrt(iSq / n); // @map feat.irms
  const rpm = (w.edges * 60) / (cfg.fan.tachPulsesPerRev * cfg.firmware.window_s); // @map feat.rpm
  return { a_rms_g, cf, i_rms_A, rpm };
}

/** Valid DS18B20 readings kept for t_C and dT/dt. */
export interface TempTracker {
  /** No reading has been seen since boot (the 85 °C power-on value is rejected only then). */
  firstPending: boolean;
  lastValid: DsRead | null;
  /** Valid readings, oldest first; trimmed to the dT/dt span. */
  history: DsRead[];
}

export function createTempTracker(): TempTracker {
  return { firstPending: true, lastValid: null, history: [] };
}

/** Records a DS18B20 reading; returns whether it is valid (spec §7.2 validity rule). */
export function addTempReading(tr: TempTracker, read: DsRead, cfg: SimConfig): boolean {
  const ds = cfg.sensors.ds18b20;
  const first = tr.firstPending;
  tr.firstPending = false;
  const valid =
    read.value_C !== ds.disconnected_C &&
    !(first && read.value_C === ds.powerOn_C) &&
    (tr.lastValid === null || Math.abs(read.value_C - tr.lastValid.value_C) <= cfg.firmware.tJumpReject_C);
  if (!valid) return false;
  tr.lastValid = read; // @map feat.temp
  tr.history.push(read);
  const oldest_s = read.t_s - cfg.firmware.dtdtSpan_s;
  while ((tr.history[0]?.t_s ?? Infinity) < oldest_s) tr.history.shift();
  return true;
}

/** t_C (last valid reading) and dT/dt (°C/min, OLS over the last dtdtSpan_s) at sim time `now_s`. */
export function tempFeatures(
  tr: TempTracker,
  now_s: number,
  cfg: SimConfig,
): { t_C: number | null; dtdt_C_per_min: number | null } {
  const t_C = tr.lastValid?.value_C ?? null;
  const recent = tr.history.filter((r) => r.t_s >= now_s - cfg.firmware.dtdtSpan_s);
  if (recent.length < cfg.firmware.dtdtMinSamples) return { t_C, dtdt_C_per_min: null };
  const mt = recent.reduce((s, r) => s + r.t_s, 0) / recent.length;
  const mT = recent.reduce((s, r) => s + r.value_C, 0) / recent.length;
  let sxy = 0;
  let sxx = 0;
  for (const r of recent) {
    sxy += (r.t_s - mt) * (r.value_C - mT);
    sxx += (r.t_s - mt) ** 2;
  }
  return { t_C, dtdt_C_per_min: (60 * sxy) / sxx }; // @map feat.dtdt
}
