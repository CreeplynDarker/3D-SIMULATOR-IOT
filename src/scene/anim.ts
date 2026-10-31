// Pure animation math for the 3D scene (spec §11 P6). Every function takes sim time or sim values, never wall time,
// so a paused sim draws the same frame again.
import type { Vec3 } from '../shared/components.ts';
import type { Net } from '../shared/wiring.ts';
import type { SimConfig } from '../sim/types.ts';

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const frac = (x: number) => x - Math.floor(x);

/** Blur-disc share 0…1: 0 up to `bladeBlurRpm`, rising linearly to 1 at twice that (rpm). */
export function bladeMix(rpm: number, bladeBlurRpm: number): number {
  return clamp01((rpm - bladeBlurRpm) / bladeBlurRpm);
}

/** Frame jitter amplitude (mm): min(vibVisualMax_mm, a_rms_g · vibVisual_mm_per_g · exaggeration). */
export function jitterAmplitude_mm(a_rms_g: number, exaggeration: number, ui: SimConfig['ui']): number {
  return Math.min(ui.vibVisualMax_mm, a_rms_g * ui.vibVisual_mm_per_g * exaggeration);
}

/** Frame offset (mm) in the fan's x–y plane: a circle of radius `amp_mm` at `freq_Hz`, phase from sim time `t_s`. */
export function jitterOffset_mm(amp_mm: number, t_s: number, freq_Hz: number): [number, number] {
  const phase = TAU * freq_Hz * t_s;
  return [amp_mm * Math.sin(phase), amp_mm * Math.cos(phase)];
}

/** Airflow streaks cross the outlet once per sim second at rated speed. */
const AIRFLOW_CYCLES_PER_s = 1;

/** Position 0…1 along the outlet of airflow streak `k` of `n` at sim time `t_s` (s), speed ∝ rpm. */
export function airflowPhase(t_s: number, k: number, rpmRated: number, rpm: number, n: number): number {
  return frac((AIRFLOW_CYCLES_PER_s * t_s * rpm) / rpmRated + k / n);
}

/** §13.3 energised rules: V12_SW iff the CH2 contact is NO, RELAY_IN while GPIO26 is LOW, every other net always. */
export function wireEnergised(net: Net, contact: 'NC' | 'NO', gpio26: 0 | 1): boolean {
  if (net === 'V12_SW') return contact === 'NO';
  if (net === 'RELAY_IN') return gpio26 === 0;
  return true;
}

/** Position 0…1 of a pulse that left at `start_s` and takes `travel_s` (sim s), or null when none is on the wire. */
export function pulseU(t_s: number, start_s: number, travelTime_s: number): number | null {
  const u = (t_s - start_s) / travelTime_s;
  return u >= 0 && u <= 1 ? u : null;
}

/** Pulse travel time in sim s: `wall_s` of wall time at `speed`, capped at `cap_s` so pulses don't overlap. */
export function travel_s(speed: number, wall_s: number, cap_s: number): number {
  return Math.min(cap_s, wall_s * speed);
}

/** Position 0…1 of pulse `k` of `n` in a continuous train running `rate` laps per sim second. */
export function continuousU(t_s: number, rate: number, k: number, n: number): number {
  return frac(t_s * rate + k / n);
}

/** 1 at `start_s`, falling linearly to 0 over `dur_s` (sim s); 0 before and after. */
export function fade(t_s: number, start_s: number, dur_s: number): number {
  const u = (t_s - start_s) / dur_s;
  return u >= 0 && u <= 1 ? 1 - u : 0;
}

/** Point at `u` on the quadratic Bézier p0–p1–p2 (any unit). */
export function bezier(p0: Vec3, p1: Vec3, p2: Vec3, u: number): [number, number, number] {
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return [0, 1, 2].map((i) => a * (p0[i] as number) + b * (p1[i] as number) + c * (p2[i] as number)) as [number, number, number]; // prettier-ignore
}

/** Hub tint range (§11 P6.4): blue at 25 °C, red at 70 °C. */
const HEAT = { cold_C: 25, hot_C: 70, cold: [0x3b, 0x82, 0xf6], hot: [0xef, 0x44, 0x44] } as const;

/** Hub tint for motor temperature `t_C` (°C) as `#rrggbb`, linear between blue and red, clamped. */
export function heatColor(t_C: number): string {
  const k = clamp01((t_C - HEAT.cold_C) / (HEAT.hot_C - HEAT.cold_C));
  return `#${HEAT.cold.map((c, i) => Math.round(c + k * ((HEAT.hot[i] as number) - c)).toString(16).padStart(2, '0')).join('')}`; // prettier-ignore
}
