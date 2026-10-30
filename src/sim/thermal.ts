// Motor thermal model (spec §6.2): one thermal capacity heated by part of the electrical power and cooled through an
// airflow-dependent resistance to an ambient that the overheat fault raises.
import type { SimConfig } from './types.ts';

type ThermalConfig = SimConfig['thermal'];

export interface ThermalState {
  tMotor_C: number;
  tAmbient_C: number;
}

/** Steady motor temperature (°C) at rated voltage, rated current and full airflow — the warm-start value. */
export function warmStartTemp_C(cfg: SimConfig): number {
  const { ambient_C, heatFraction, rTh0_KperW, airflowCooling } = cfg.thermal;
  const ratedCurrent_A = cfg.fan.iIdle_A + cfg.fan.iAero_A;
  return ambient_C + (heatFraction * cfg.fan.vRated_V * ratedCurrent_A * rTh0_KperW) / (1 + airflowCooling);
}

/** Motor at the warm-start temperature, or at ambient for a cold start. */
export function createThermal(cfg: SimConfig, warmStart: boolean): ThermalState {
  const tMotor_C = warmStart ? warmStartTemp_C(cfg) : cfg.thermal.ambient_C;
  return { tMotor_C, tAmbient_C: cfg.thermal.ambient_C };
}

/**
 * Advances the motor temperature by `dt_s`, given fan voltage `v_V`, mean current `i_A`, speed ratio `r` (ω/ω_rated)
 * and overheat level (0–1); mutates `th`.
 */
export function stepThermal(
  th: ThermalState,
  cfg: ThermalConfig,
  v_V: number,
  i_A: number,
  r: number,
  overheat: number,
  dt_s: number,
): void {
  th.tAmbient_C = cfg.ambient_C + overheat * cfg.overheatAmbientMax_K;
  const heat_W = cfg.heatFraction * v_V * i_A;
  const rTh_KperW = cfg.rTh0_KperW / (1 + cfg.airflowCooling * r);
  th.tMotor_C += ((heat_W - (th.tMotor_C - th.tAmbient_C) / rTh_KperW) / cfg.cTh_JperK) * dt_s;
}
