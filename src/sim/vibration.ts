// True acceleration at the MPU6050 in g (spec §6.3): rotating unbalance (1×), looseness harmonics, impacts and noise,
// blade pass, plus 1 g of gravity on y.
import type { RngStream } from '../shared/rng.ts';
import { G0_mps2, rpmToRadps } from '../shared/units.ts';
import type { SimConfig } from './types.ts';

/** Shape factors fixed by the §6.3 equations: radial share of blade pass, axial share of 1×, axial phase. */
export const VIB_SHAPE = { bladeRadial: 0.3, axial: 0.2, axialPhase_rad: Math.PI / 4 } as const;
/** g·mm → kg·m. */
const GMM_TO_KGM = 1e-6;
const TAU = 2 * Math.PI;

export interface VibrationState {
  /** Looseness harmonic phases, drawn once per run (rad). */
  phi2_rad: number;
  phi3_rad: number;
  /** Completed revolutions, floor(θ / 2π). */
  revs: number;
  /** Time since the last revolution started (s); restarts the looseness impact. */
  sinceRev_s: number;
  /** Acceleration x, y, z (g). */
  accel_g: Float64Array;
}

/** Vibration state with the harmonic phases drawn from `rng` (the plant stream). */
export function createVibration(rng: RngStream): VibrationState {
  return {
    phi2_rad: rng.uniform() * TAU,
    phi3_rad: rng.uniform() * TAU,
    revs: 0,
    sinceRev_s: 0,
    accel_g: Float64Array.of(0, 1, 0),
  };
}

/** 1× unbalance amplitude A1 (g) at speed `omega_radps` with added imbalance `imbalance_g` (g at the radius). */
export function unbalanceA1_g(cfg: SimConfig['fan'], omega_radps: number, imbalance_g: number): number {
  const u_gmm = cfg.residualUnbalance_gmm + imbalance_g * cfg.unbalanceRadius_mm;
  return (u_gmm * GMM_TO_KGM * omega_radps ** 2) / (cfg.mountMass_kg * G0_mps2);
}

/** Computes the acceleration for rotor angle `theta_rad` and speed `omega_radps` at the end of a step of `dt_s`. */
export function stepVibration(
  v: VibrationState,
  cfg: SimConfig['fan'],
  theta_rad: number,
  omega_radps: number,
  imbalance_g: number,
  looseness: number,
  rng: RngStream,
  dt_s: number,
): void {
  const revs = Math.floor(theta_rad / TAU);
  if (revs > v.revs) v.sinceRev_s = 0;
  else v.sinceRev_s += dt_s;
  v.revs = revs;

  const A1 = unbalanceA1_g(cfg, omega_radps, imbalance_g);
  const L = looseness;
  const G = 1 + cfg.looseGain * L;
  const r = omega_radps / rpmToRadps(cfg.rpmRated);
  const B = cfg.bladePass_g * r * r;
  const t = v.sinceRev_s;
  const imp = L > 0 ? cfg.looseImpulseGain * L * A1 * Math.exp(-t / cfg.looseImpulseTau_s) * Math.sin(TAU * cfg.looseImpulseFreq_Hz * t) : 0; // prettier-ignore
  const sigma = cfg.looseNoise_g * L;
  const noise = () => (sigma > 0 ? rng.normal(0, sigma) : 0);
  const th2 = 2 * theta_rad + v.phi2_rad;
  const th3 = 3 * theta_rad + v.phi3_rad;
  const bladeAngle = cfg.blades * theta_rad;
  const h2 = cfg.looseH2 * L * A1;
  const h3 = cfg.looseH3 * L * A1;
  const a = v.accel_g;
  a[0] = G * A1 * Math.cos(theta_rad) + h2 * Math.cos(th2) + h3 * Math.cos(th3) + VIB_SHAPE.bladeRadial * B * Math.sin(bladeAngle) + imp + noise(); // prettier-ignore
  a[1] = G * A1 * Math.sin(theta_rad) + h2 * Math.sin(th2) + h3 * Math.sin(th3) + VIB_SHAPE.bladeRadial * B * Math.cos(bladeAngle) + imp + noise() + 1; // prettier-ignore
  a[2] = VIB_SHAPE.axial * G * A1 * Math.cos(theta_rad + VIB_SHAPE.axialPhase_rad) + B * Math.sin(bladeAngle) + noise(); // prettier-ignore
}
