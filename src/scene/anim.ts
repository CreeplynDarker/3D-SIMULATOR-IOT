// Pure animation math for the 3D scene (spec §11 P6). Every function takes sim time or sim values, never wall time,
// so a paused sim draws the same frame again.
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
