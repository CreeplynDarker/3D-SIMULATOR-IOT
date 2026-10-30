// MPU6050 accelerometer chain (spec §6.4): a first-order DLPF every physics step, then noise, 16-bit quantisation and
// range clipping at each firmware sample.
import type { RngStream } from '../../shared/rng.ts';
import type { SimConfig } from '../types.ts';

type MpuConfig = SimConfig['sensors']['mpu'];

export interface MpuState {
  /** DLPF output per axis x, y, z (g). */
  lp_g: Float64Array;
  /** DLPF coefficient for the physics step. */
  alpha: number;
}

/** Filter at rest (0 g on every axis) for a physics step of `dt_s`. */
export function createMpu(cfg: MpuConfig, dt_s: number): MpuState {
  const alpha = dt_s / (1 / (2 * Math.PI * cfg.dlpfCutoff_Hz) + dt_s);
  return { lp_g: new Float64Array(3), alpha };
}

/** One DLPF step towards the true acceleration (ax, ay, az) in g. */
export function filterMpu(mpu: MpuState, ax_g: number, ay_g: number, az_g: number): void {
  const lp = mpu.lp_g;
  lp[0] = (lp[0] ?? 0) + mpu.alpha * (ax_g - (lp[0] ?? 0));
  lp[1] = (lp[1] ?? 0) + mpu.alpha * (ay_g - (lp[1] ?? 0));
  lp[2] = (lp[2] ?? 0) + mpu.alpha * (az_g - (lp[2] ?? 0));
}

/** Rounds to the sensor's LSB (1/lsbPerG g) and clips to ±range_g. */
export function quantiseMpu_g(a_g: number, cfg: MpuConfig): number {
  const q = Math.round(a_g * cfg.lsbPerG) / cfg.lsbPerG;
  return Math.min(cfg.range_g, Math.max(-cfg.range_g, q));
}

/** Firmware sample: filtered value + N(0, noise_g²), quantised, written to `out_g` (x, y, z in g). */
export function sampleMpu(mpu: MpuState, cfg: MpuConfig, rng: RngStream, out_g: Float64Array): void {
  for (let k = 0; k < 3; k++) out_g[k] = quantiseMpu_g((mpu.lp_g[k] ?? 0) + rng.normal(0, cfg.noise_g), cfg);
}
