// Fan model (spec §6.1): first-order speed response, coast-down, and a current made of idle, aerodynamic, friction,
// inrush and commutation-ripple terms.
import { radpsToRpm, rpmToRadps } from '../shared/units.ts';
import type { SimConfig } from './types.ts';

type FanConfig = SimConfig['fan'];

export interface FanState {
  /** Supply at the fan terminals (V). */
  voltage_V: number;
  omega_radps: number;
  omegaTarget_radps: number;
  /** Rotor angle, unbounded (rad). */
  theta_rad: number;
  rpm: number;
  /** Mean current without ripple (A); drives the thermal model. */
  current_A: number;
  /** Instantaneous current including ripple (A); what the ACS712 sees. */
  currentInst_A: number;
  power_W: number;
}

/** A stopped, unpowered fan. */
export function createFan(): FanState {
  return {
    voltage_V: 0,
    omega_radps: 0,
    omegaTarget_radps: 0,
    theta_rad: 0,
    rpm: 0,
    current_A: 0,
    currentInst_A: 0,
    power_W: 0,
  };
}

/** Steady-state speed (rad/s) at supply `v_V` and friction level `friction` (0–1). */
export function fanTargetOmega_radps(cfg: FanConfig, v_V: number, friction: number): number {
  const span_V = cfg.vRated_V - cfg.vStart_V;
  const maxRatio = (cfg.vMax_V - cfg.vStart_V) / span_V;
  const ratio = Math.min(Math.max((v_V - cfg.vStart_V) / span_V, 0), maxRatio);
  return rpmToRadps(cfg.rpmRated) * ratio * (1 - cfg.frictionSpeedLoss * friction);
}

/** Advances the fan by `dt_s` at supply `v_V` (V) and friction level `friction` (0–1); mutates `fan`. */
export function stepFan(fan: FanState, cfg: FanConfig, v_V: number, friction: number, dt_s: number): void {
  const omegaRated_radps = rpmToRadps(cfg.rpmRated);
  const powered = v_V >= cfg.vStart_V;
  const target = powered ? fanTargetOmega_radps(cfg, v_V, friction) : 0;
  const dOmega = powered
    ? (target - fan.omega_radps) / cfg.tauUp_s
    : -fan.omega_radps / (cfg.tauDown_s * (1 - cfg.frictionCoastFactor * friction));
  fan.omega_radps += dOmega * dt_s;
  fan.theta_rad += fan.omega_radps * dt_s;
  fan.omegaTarget_radps = target;
  fan.voltage_V = v_V;
  fan.rpm = radpsToRpm(fan.omega_radps);

  if (!powered) {
    fan.current_A = 0;
    fan.currentInst_A = 0;
    fan.power_W = 0;
    return;
  }
  const r = fan.omega_radps / omegaRated_radps;
  const base_A = cfg.iIdle_A + cfg.iAero_A * r ** 3 + cfg.iFriction_A * friction * r;
  const inrush_A = target > 0 ? cfg.iInrushGain_A * Math.max(0, 1 - fan.omega_radps / target) : 0;
  fan.current_A = inrush_A > 0 ? Math.min(cfg.iInrushMax_A, base_A + inrush_A) : base_A;
  fan.currentInst_A = fan.current_A + cfg.iRipple_A * Math.sin(cfg.rippleHarmonic * fan.theta_rad);
  fan.power_W = v_V * fan.current_A;
}
