import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import { stream } from '../../../src/shared/rng.ts';
import { createFan, stepFan } from '../../../src/sim/fan.ts';
import { acs712Out_V } from '../../../src/sim/sensors/acs712.ts';
import { adcCounts, dividerOut_V } from '../../../src/sim/sensors/adc.ts';
import { createDs18b20, stepDs18b20 } from '../../../src/sim/sensors/ds18b20.ts';
import { createMpu, filterMpu, quantiseMpu_g, sampleMpu } from '../../../src/sim/sensors/mpu6050.ts';
import { createTach, stepTach } from '../../../src/sim/sensors/tach.ts';

const S = CONFIG.sensors;
const dt_s = CONFIG.physics.dt_s;

describe('ACS712 (§6.5)', () => {
  it('outputs 2.500 V at 0 A and 2.5 + 0.185·I without noise', () => {
    expect(acs712Out_V(0, S.acs712, 0)).toBe(2.5);
    for (const i of [-0.5, 0.18, 0.33, 1]) expect(acs712Out_V(i, S.acs712, 0)).toBeCloseTo(2.5 + 0.185 * i, 12);
    expect(acs712Out_V(0.18, S.acs712, 0.004)).toBeCloseTo(2.5 + 0.185 * 0.18 + 0.004, 12);
  });
});

describe('divider and ADC (§6.5)', () => {
  it('divides by rBottom / (rTop + rBottom) = 2/3', () => {
    expect(dividerOut_V(2.5, S.divider)).toBeCloseTo(2.5 * (2 / 3), 12);
  });

  it('includes the INL term and stays within [0, 4095]', () => {
    const { maxCount, vMin_V, vSpan_V, inl_counts } = S.adc;
    for (let v = -0.5; v <= 3.6; v += 0.01) {
      const counts = adcCounts(v, S.adc, 0);
      expect(counts).toBeGreaterThanOrEqual(0);
      expect(counts).toBeLessThanOrEqual(maxCount);
      expect(Number.isInteger(counts)).toBe(true);
      const ideal = (maxCount * (v - vMin_V)) / vSpan_V + inl_counts * Math.sin((Math.PI * v) / 3.1);
      expect(counts).toBe(Math.min(maxCount, Math.max(0, Math.round(ideal))));
    }
    // at 1.55 V the INL bow peaks: +6 counts over the straight line
    const linear = Math.round((maxCount * (1.55 - vMin_V)) / vSpan_V);
    expect(adcCounts(1.55, S.adc, 0) - linear).toBe(inl_counts);
    expect(adcCounts(0, S.adc, 0)).toBe(0);
    expect(adcCounts(3.3, S.adc, 0)).toBe(maxCount);
  });

  it('adds Gaussian count noise before rounding', () => {
    expect(adcCounts(1.6667, S.adc, 2.4) - adcCounts(1.6667, S.adc, 0)).toBe(2);
  });
});

describe('MPU6050 (§6.4)', () => {
  it('low-passes each axis with α = dt / (1/(2π·fc) + dt)', () => {
    const mpu = createMpu(S.mpu, dt_s);
    const alpha = dt_s / (1 / (2 * Math.PI * S.mpu.dlpfCutoff_Hz) + dt_s);
    expect(mpu.alpha).toBeCloseTo(alpha, 15);
    filterMpu(mpu, Float64Array.of(1, -1, 0.5));
    expect([...mpu.lp_g]).toEqual([alpha, -alpha, 0.5 * alpha]);
  });

  it('quantises to 1/16384 g and clips at ±2 g', () => {
    for (const a of [0.12345, -0.98765, 1.5, 1e-6]) {
      const q = quantiseMpu_g(a, S.mpu);
      expect(Number.isInteger(q * 16384)).toBe(true);
      expect(Math.abs(q - a)).toBeLessThanOrEqual(0.5 / 16384 + 1e-15);
    }
    expect(quantiseMpu_g(3.1, S.mpu)).toBe(2);
    expect(quantiseMpu_g(-7, S.mpu)).toBe(-2);
  });

  it('samples filtered value + noise, then quantises', () => {
    const mpu = createMpu(S.mpu, dt_s);
    for (let k = 0; k < 400; k++) filterMpu(mpu, Float64Array.of(0.1, 1, 0));
    const out = new Float64Array(3);
    const rng = stream(CONFIG.seed, 'mpu');
    const xs: number[] = [];
    for (let k = 0; k < 4000; k++) {
      sampleMpu(mpu, S.mpu, rng, out);
      xs.push(out[1] ?? 0);
      expect(Number.isInteger((out[0] ?? 0) * 16384)).toBe(true);
    }
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const std = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(mean).toBeCloseTo(1, 3);
    expect(Math.abs(std - S.mpu.noise_g)).toBeLessThan(0.001);
  });
});

describe('DS18B20 (§6.6)', () => {
  /** Steps the probe for `t_s` at true temperature `tTrue_C`; records (time, value) of every new reading. */
  function run(t_s: number, tTrue_C: (t: number) => number, disconnect: (t: number) => boolean = () => false) {
    const ds = createDs18b20(S.ds18b20, 30);
    const readings: [number, number][] = [];
    for (let k = 1; k <= Math.round(t_s / dt_s); k++) {
      const t = k * dt_s;
      const before = ds.readings;
      stepDs18b20(ds, S.ds18b20, tTrue_C(t), t, dt_s, disconnect(t));
      if (ds.readings !== before) readings.push([t, ds.reading_C]);
    }
    return { ds, readings };
  }

  it('returns 85.0 first, then multiples of 0.0625, every 1 s and 0.75 s after each request', () => {
    const { readings } = run(5.5, () => 40.03);
    expect(readings.map(([t]) => Number(t.toFixed(4)))).toEqual([0.75, 1.75, 2.75, 3.75, 4.75]);
    expect(readings[0]?.[1]).toBe(85);
    for (const [, v] of readings.slice(1)) expect(Number.isInteger(v / 0.0625)).toBe(true);
  });

  it('lags the true temperature with τ = 8 s', () => {
    const ds = createDs18b20(S.ds18b20, 30);
    for (let k = 1; k <= Math.round(8 / dt_s); k++) stepDs18b20(ds, S.ds18b20, 40, k * dt_s, dt_s, false);
    expect(ds.probe_C).toBeCloseTo(30 + 10 * (1 - Math.exp(-1)), 2);
  });

  it('reads −127 while disconnected and recovers afterwards', () => {
    const { readings } = run(
      6,
      () => 30,
      (t) => t > 2 && t < 4,
    );
    expect(readings.map(([, v]) => v)).toEqual([85, 30, -127, -127, 30, 30]);
  });
});

describe('tach (§6.7)', () => {
  it('gives 2 edges per revolution (±1 per 1 s window) and toggles the pin level', () => {
    const fan = createFan();
    const tach = createTach();
    for (let k = 0; k < Math.round(5 / dt_s); k++) {
      stepFan(fan, CONFIG.fan, 12, 0, dt_s);
      stepTach(tach, fan.theta_rad, CONFIG.fan.tachPulsesPerRev);
    }
    for (let w = 0; w < 5; w++) {
      const edges0 = tach.edges;
      const theta0 = fan.theta_rad;
      let levels = new Set<boolean>();
      for (let k = 0; k < Math.round(1 / dt_s); k++) {
        stepFan(fan, CONFIG.fan, 12, 0, dt_s);
        stepTach(tach, fan.theta_rad, CONFIG.fan.tachPulsesPerRev);
        levels = levels.add(tach.high);
      }
      const revs = (fan.theta_rad - theta0) / (2 * Math.PI);
      expect(Math.abs(tach.edges - edges0 - 2 * revs)).toBeLessThanOrEqual(1);
      expect(levels.size).toBe(2);
    }
  });

  it('counts no edges when the rotor is still', () => {
    const tach = createTach();
    for (let k = 0; k < 100; k++) stepTach(tach, 0.1, 2);
    expect(tach.edges).toBe(0);
    expect(tach.high).toBe(true);
  });
});
