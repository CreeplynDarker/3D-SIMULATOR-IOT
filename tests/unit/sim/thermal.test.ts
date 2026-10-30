import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import { createThermal, stepThermal, type ThermalState, warmStartTemp_C } from '../../../src/sim/thermal.ts';

const dt_s = CONFIG.physics.dt_s;
const RATED = { v_V: 12, i_A: 0.18, r: 1 };

/** Holds the fan at rated speed and current for `t_s`; calls `each` once per simulated second. */
function hold(th: ThermalState, t_s: number, overheat: number, each?: (t: number) => void): void {
  const perSecond = Math.round(1 / dt_s);
  for (let k = 0; k < Math.round(t_s / dt_s); k++) {
    stepThermal(th, CONFIG.thermal, RATED.v_V, RATED.i_A, RATED.r, overheat, dt_s);
    if (each && (k + 1) % perSecond === 0) each((k + 1) / perSecond);
  }
}

describe('thermal (§6.2)', () => {
  it('warm-starts at 34.07 ± 0.05 °C', () => {
    expect(Math.abs(warmStartTemp_C(CONFIG) - 34.07)).toBeLessThanOrEqual(0.05);
    expect(createThermal(CONFIG, true).tMotor_C).toBe(warmStartTemp_C(CONFIG));
    expect(createThermal(CONFIG, false).tMotor_C).toBe(CONFIG.thermal.ambient_C);
  });

  it('stays within ±0.1 °C of the warm start over 600 s at rated speed and current', () => {
    const th = createThermal(CONFIG, true);
    const t0 = th.tMotor_C;
    let worst = 0;
    hold(th, 600, 0, () => (worst = Math.max(worst, Math.abs(th.tMotor_C - t0))));
    expect(worst).toBeLessThanOrEqual(0.1);
  });

  it('overheat 1.0 drives the steady state to 69.1 ± 0.5 °C', () => {
    const th = createThermal(CONFIG, true);
    hold(th, 3000, 1);
    expect(th.tAmbient_C).toBe(CONFIG.thermal.ambient_C + CONFIG.thermal.overheatAmbientMax_K);
    expect(Math.abs(th.tMotor_C - 69.1)).toBeLessThanOrEqual(0.5);
  });

  it('reaches 63% of an ambient step in 160–200 s', () => {
    const th = createThermal(CONFIG, true);
    const t0 = th.tMotor_C;
    const target = t0 + 0.632 * CONFIG.thermal.overheatAmbientMax_K; // P·R is unchanged, so ΔT_ss = ΔT_amb
    let rise_s = Infinity;
    hold(th, 400, 1, (t) => {
      if (rise_s === Infinity && th.tMotor_C >= target) rise_s = t;
    });
    expect(rise_s).toBeGreaterThanOrEqual(160);
    expect(rise_s).toBeLessThanOrEqual(200);
  });

  it('cools toward ambient with the fan off (τ = C·R0 = 270 s without airflow)', () => {
    const th = createThermal(CONFIG, true);
    for (let k = 0; k < Math.round(2000 / dt_s); k++) stepThermal(th, CONFIG.thermal, 0, 0, 0, 0, dt_s);
    expect(th.tMotor_C - CONFIG.thermal.ambient_C).toBeLessThan(0.1);
    expect(th.tMotor_C).toBeGreaterThan(CONFIG.thermal.ambient_C);
  });
});
