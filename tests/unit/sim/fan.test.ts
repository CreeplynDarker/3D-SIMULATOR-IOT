import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import { createFan, type FanState, stepFan } from '../../../src/sim/fan.ts';

const dt_s = CONFIG.physics.dt_s;
const steps = (t_s: number) => Math.round(t_s / dt_s);

/** Runs the fan for `t_s` at `v_V` and `friction`; returns per-step current samples. */
function run(fan: FanState, t_s: number, v_V: number, friction = 0): number[] {
  const current_A: number[] = [];
  for (let i = 0; i < steps(t_s); i++) {
    stepFan(fan, CONFIG.fan, v_V, friction, dt_s);
    current_A.push(fan.currentInst_A);
  }
  return current_A;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const last = (xs: number[], t_s: number) => xs.slice(-steps(t_s));

describe('fan (§6.1)', () => {
  it('settles at 3,800 RPM ±2% and 0.18 A ±5% at 12 V within 5 s', () => {
    const fan = createFan();
    const current_A = run(fan, 5, 12);
    expect(Math.abs(fan.rpm - 3800) / 3800).toBeLessThanOrEqual(0.02);
    expect(Math.abs(mean(last(current_A, 1)) - 0.18) / 0.18).toBeLessThanOrEqual(0.05);
    expect(fan.voltage_V).toBe(12);
    expect(fan.power_W).toBeCloseTo(12 * fan.current_A, 12);
  });

  it('peaks at ≤ 0.33 A during spin-up', () => {
    const current_A = run(createFan(), 5, 12);
    expect(Math.max(...current_A)).toBeLessThanOrEqual(0.33);
    expect(Math.max(...current_A.slice(0, 20))).toBeGreaterThan(0.17); // inrush is visible at the start
  });

  it('friction 0.3 lowers RPM by 7.5% ±0.5% and raises I above 0.24 A', () => {
    const fan = createFan();
    run(fan, 6, 12);
    const rpm0 = fan.rpm;
    const current_A = run(fan, 6, 12, 0.3);
    expect(Math.abs((rpm0 - fan.rpm) / rpm0 - 0.075)).toBeLessThanOrEqual(0.005);
    expect(mean(last(current_A, 1))).toBeGreaterThan(0.24);
  });

  it('coasts down from 3,800 RPM to < 100 RPM in ≤ 12 s', () => {
    const fan = createFan();
    run(fan, 6, 12);
    let t_s = 0;
    while (fan.rpm >= 100 && t_s < 20) {
      stepFan(fan, CONFIG.fan, 0, 0, dt_s);
      t_s += dt_s;
    }
    expect(t_s).toBeLessThanOrEqual(12);
    expect(fan.current_A).toBe(0);
  });

  it('friction shortens the coast-down', () => {
    const coast = (friction: number) => {
      const fan = createFan();
      run(fan, 6, 12, friction);
      let n = 0;
      while (fan.rpm >= 100) {
        stepFan(fan, CONFIG.fan, 0, friction, dt_s);
        n++;
      }
      return n;
    };
    expect(coast(0.5)).toBeLessThan(coast(0));
  });

  it('draws zero current below 4 V', () => {
    const current_A = run(createFan(), 2, 3.9);
    expect(current_A.every((i) => i === 0)).toBe(true);
  });

  it('advances θ by ω·dt and adds the 4th-harmonic ripple to the instantaneous current', () => {
    const fan = createFan();
    run(fan, 5, 12);
    const theta0 = fan.theta_rad;
    stepFan(fan, CONFIG.fan, 12, 0, dt_s);
    expect(fan.theta_rad - theta0).toBeCloseTo(fan.omega_radps * dt_s, 9);
    const ripple = fan.currentInst_A - fan.current_A;
    expect(ripple).toBeCloseTo(CONFIG.fan.iRipple_A * Math.sin(CONFIG.fan.rippleHarmonic * fan.theta_rad), 12);
  });

  it('caps the target speed at vMax', () => {
    const fan = createFan();
    run(fan, 6, 20);
    const cap = (CONFIG.fan.vMax_V - CONFIG.fan.vStart_V) / (CONFIG.fan.vRated_V - CONFIG.fan.vStart_V);
    expect(fan.rpm).toBeCloseTo(3800 * cap, -1);
  });
});
