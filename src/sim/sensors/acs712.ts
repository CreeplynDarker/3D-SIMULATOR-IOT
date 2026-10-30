// ACS712 Hall current sensor (spec §6.5).
import type { SimConfig } from '../types.ts';

/** Sensor output (V) for current `i_A` (A) plus a noise sample `noise_V` (V) drawn by the caller. */
export function acs712Out_V(i_A: number, cfg: SimConfig['sensors']['acs712'], noise_V: number): number {
  return cfg.vZero_V + cfg.sens_VperA * i_A + noise_V;
}
