import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addTempReading,
  computeFeatures,
  createTempTracker,
  currentFromCounts_A,
  tempFeatures,
} from '../../../src/firmware/features.ts';
import type { WindowData } from '../../../src/firmware/sampler.ts';
import { CONFIG } from '../../../src/shared/config.ts';

const DS = CONFIG.sensors.ds18b20;

interface Fixture {
  name: string;
  counts0: number;
  now_s: number;
  window: { ax_lsb: number[]; ay_lsb: number[]; az_lsb: number[]; counts: number[]; edges: number };
  temps: [number, number][];
  reference: Record<'a_rms_g' | 'cf' | 'i_rms_A' | 'rpm' | 't_C' | 'dtdt_C_per_min', number | null>;
}

const fixtureDir = resolve(import.meta.dirname, '../../fixtures');
const fixtures: Fixture[] = readdirSync(fixtureDir)
  .filter((f) => /^features_.*\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(join(fixtureDir, f), 'utf8')) as Fixture);

function toWindow(f: Fixture): WindowData {
  const g = (lsb: number[]) => Float64Array.from(lsb, (x) => x / CONFIG.sensors.mpu.lsbPerG);
  const n = f.window.counts.length;
  return {
    index: 0,
    tEnd_s: f.now_s,
    n,
    ax_g: g(f.window.ax_lsb),
    ay_g: g(f.window.ay_lsb),
    az_g: g(f.window.az_lsb),
    counts: Float64Array.from(f.window.counts),
    edges: f.window.edges,
  };
}

const close = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) <= 1e-6 * Math.abs(b) + 1e-12;

describe('features vs the NumPy reference (§7.2)', () => {
  it('has the five fixed windows', () => {
    expect(fixtures.map((f) => f.name).sort()).toEqual([
      'friction',
      'healthy',
      'imbalance',
      'looseness',
      'sensor-null',
    ]);
  });

  for (const f of fixtures) {
    it(`${f.name}: TS features match within 1e-6 relative`, () => {
      const feats = computeFeatures(toWindow(f), f.counts0, CONFIG);
      const tracker = createTempTracker();
      for (const [t_s, value_C] of f.temps) addTempReading(tracker, { t_s, value_C }, CONFIG);
      const temp = tempFeatures(tracker, f.now_s, CONFIG);
      const ts = { ...feats, ...temp };
      for (const key of Object.keys(f.reference) as (keyof Fixture['reference'])[]) {
        expect(close(ts[key], f.reference[key]), `${key}: ${ts[key]} vs ${f.reference[key]}`).toBe(true);
      }
    });
  }
});

describe('features: unit cases', () => {
  const window = (ax: number[], counts: number[] = ax.map(() => 1500), edges = 0): WindowData => ({
    index: 0,
    tEnd_s: 1,
    n: ax.length,
    ax_g: Float64Array.from(ax),
    ay_g: new Float64Array(ax.length).fill(1),
    az_g: new Float64Array(ax.length),
    counts: Float64Array.from(counts),
    edges,
  });

  it('a pure sine axis gives CF = √2 ± 0.01', () => {
    const ax = Array.from({ length: 1000 }, (_, n) => 0.3 * Math.sin((2 * Math.PI * 63 * n) / 1000));
    expect(Math.abs(computeFeatures(window(ax), 1500, CONFIG).cf - Math.SQRT2)).toBeLessThanOrEqual(0.01);
  });

  it('removes each axis mean, so gravity and offsets do not count', () => {
    const f = computeFeatures(window(new Array(1000).fill(0.25)), 1500, CONFIG);
    expect(f.a_rms_g).toBe(0);
    expect(f.cf).toBe(0);
  });

  it('turns ADC counts into amps through the divider and the ACS712 sensitivity', () => {
    const { adc, divider, acs712 } = CONFIG.sensors;
    const perCount_A = (adc.vSpan_V / adc.maxCount) * ((divider.rTop_ohm + divider.rBottom_ohm) / divider.rBottom_ohm) / acs712.sens_VperA; // prettier-ignore
    expect(currentFromCounts_A(1510, 1500, CONFIG)).toBeCloseTo(10 * perCount_A, 12);
    const f = computeFeatures(window(new Array(1000).fill(0), new Array(1000).fill(1510)), 1500, CONFIG);
    expect(f.i_rms_A).toBeCloseTo(10 * perCount_A, 12);
  });

  it('converts PCNT edges to rpm', () => {
    expect(computeFeatures(window([0, 0], [1500, 1500], 126), 1500, CONFIG).rpm).toBe(3780);
  });
});

describe('temperature validity and dT/dt (§7.2)', () => {
  it('rejects 85 °C as the first reading after boot, −127 °C, and jumps over 10 °C', () => {
    const tr = createTempTracker();
    expect(addTempReading(tr, { t_s: 0.75, value_C: DS.powerOn_C }, CONFIG)).toBe(false);
    expect(addTempReading(tr, { t_s: 1.75, value_C: 34 }, CONFIG)).toBe(true);
    expect(addTempReading(tr, { t_s: 2.75, value_C: DS.disconnected_C }, CONFIG)).toBe(false);
    expect(addTempReading(tr, { t_s: 3.75, value_C: 45 }, CONFIG)).toBe(false);
    expect(addTempReading(tr, { t_s: 4.75, value_C: 43.9 }, CONFIG)).toBe(true);
    expect(tempFeatures(tr, 5, CONFIG).t_C).toBe(43.9);
  });

  it('accepts 85 °C later when it is within the jump limit (a hot motor, not a reset)', () => {
    const tr = createTempTracker();
    addTempReading(tr, { t_s: 1, value_C: 80 }, CONFIG);
    expect(addTempReading(tr, { t_s: 2, value_C: 85 }, CONFIG)).toBe(true);
  });

  it('has t_C null before any valid reading', () => {
    expect(tempFeatures(createTempTracker(), 10, CONFIG)).toEqual({ t_C: null, dtdt_C_per_min: null });
  });

  it('dT/dt is null with fewer than 10 valid readings in the last 60 s, and 60 × the OLS slope otherwise', () => {
    const tr = createTempTracker();
    for (let k = 0; k < 9; k++) addTempReading(tr, { t_s: k, value_C: 30 + 0.01 * k }, CONFIG);
    expect(tempFeatures(tr, 9, CONFIG).dtdt_C_per_min).toBeNull();
    addTempReading(tr, { t_s: 9, value_C: 30.09 }, CONFIG);
    expect(tempFeatures(tr, 10, CONFIG).dtdt_C_per_min).toBeCloseTo(0.6, 9);
    // readings older than 60 s drop out of the fit
    expect(tempFeatures(tr, 68.5, CONFIG).dtdt_C_per_min).toBeNull();
  });
});
