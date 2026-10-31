// P8.4: calibration recovers known parameters from simulated recordings within 10 %, and the simulated baseline
// with the proposed config is within 10 % of the recorded one.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyCalibration, baselineMeans, calibrate, coastAverage, configValue, minimize1d, recordCalibration, spinUpAverage, twoLagStep, withValues } from '../../../src/harness/calibrate.ts'; // prettier-ignore
import { patchConfigSource, roundProposal, unifiedDiff } from '../../../src/harness/configDiff.ts';
import { CALIBRATED_KEYS } from '../../../src/shared/calibration.ts';
import { CONFIG } from '../../../src/shared/config.ts';

const TOLERANCE = 0.1;
// Known parameters away from the defaults; iIdle and iAero move by different factors (only their sum is seen).
const SHIFTED = {
  'fan.rpmRated': 3500, 'fan.tauUp_s': 1.2, 'fan.tauDown_s': 3.4, 'fan.iIdle_A': 0.035, 'fan.iAero_A': 0.17,
  'fan.residualUnbalance_gmm': 2.6, 'thermal.ambient_C': 22, 'thermal.rTh0_KperW': 21, 'thermal.cTh_JperK': 20,
  'sensors.mpu.noise_g': 0.009, 'sensors.acs712.noise_V': 0.0065, 'sensors.adc.noise_counts': 2.6,
}; // prettier-ignore
const CASES = [
  { name: 'the defaults', values: {}, seed: 11 },
  { name: 'shifted parameters', values: SHIFTED, seed: 7 },
];

describe('calibration (P8.4)', () => {
  for (const c of CASES) {
    it(`recovers ${c.name} within 10 %, and the proposed config reproduces the baseline within 10 %`, () => {
      const truth = withValues(CONFIG, c.values);
      const recording = recordCalibration(truth, c.seed);
      const result = calibrate(recording, CONFIG);
      expect(result.entries.map((e) => e.key)).toEqual([...CALIBRATED_KEYS]);
      for (const e of result.entries) {
        const want = configValue(truth, e.key);
        expect(e.proposed, e.key).not.toBeNull();
        expect(Math.abs((e.proposed as number) - want) / want, `${e.key}: ${e.proposed} vs ${want}`).toBeLessThan(TOLERANCE); // prettier-ignore
        expect(e.outOfRange, e.key).toBe(false);
      }
      const recorded = baselineMeans(recording, CONFIG);
      const simulated = baselineMeans(recordCalibration(applyCalibration(CONFIG, result), c.seed + 1), CONFIG);
      for (const [k, v] of Object.entries(recorded)) {
        const s = simulated[k as keyof typeof simulated];
        expect(Math.abs(s - v) / v, `${k}: ${s} vs ${v}`).toBeLessThan(TOLERANCE);
      }
    }, 30_000);
  }

  it('without an E-STOP it keeps tauDown and the current noise, and still fits the rest; flags §5.2 ranges', () => {
    const recording = recordCalibration(CONFIG, 3).filter((p) => p.ts_ms <= 600_000);
    const lowNoise = withValues(CONFIG, { 'sensors.mpu.noise_g': 0.002 });
    const result = calibrate(recording, lowNoise);
    const by = Object.fromEntries(result.entries.map((e) => [e.key, e]));
    expect(result.switch_s.off).toBeNull();
    expect(by['fan.tauDown_s']?.proposed).toBeNull();
    expect(by['sensors.acs712.noise_V']?.proposed).toBeNull();
    expect(by['fan.iIdle_A']?.proposed).toBeCloseTo(CONFIG.fan.iIdle_A, 2);
    expect(by['sensors.mpu.noise_g']?.outOfRange).toBe(true); // 0.007 is 3.5 × the 0.002 it started from
    expect(by['thermal.cTh_JperK']?.proposed).toBeGreaterThan(0);
  }, 30_000);

  it('refuses a recording that never powers the fan or never runs past the start grace', () => {
    const recording = recordCalibration(CONFIG, 3);
    expect(() => calibrate(recording.slice(0, 9), CONFIG)).toThrow(/never powers the fan/);
    expect(() => calibrate(recording.slice(0, 15), CONFIG)).toThrow(/no steady running/);
  }, 30_000);

  it('window-averaged curves and the minimiser', () => {
    expect(spinUpAverage(0, 1, 2, 0.8)).toBe(0); // not started yet
    expect(spinUpAverage(100, 101, 0, 0.8)).toBeCloseTo(1, 9);
    expect(spinUpAverage(0, 1, 0, 0.8)).toBeCloseTo(1 - 0.8 * (1 - Math.exp(-1.25)), 9);
    expect(coastAverage(0, 1, 5, 2.5)).toBe(1); // still at full speed
    expect(coastAverage(100, 101, 0, 2.5)).toBeCloseTo(0, 9);
    expect(twoLagStep(-1, 100, 8)).toBe(0);
    expect(twoLagStep(1e6, 100, 8)).toBeCloseTo(1, 9);
    expect(twoLagStep(10, 8, 8)).toBeCloseTo(1 - (1 + 10 / 8) * Math.exp(-10 / 8), 9); // equal lags
    expect(minimize1d((x) => (x - 0.37) ** 2, -2, 3)).toBeCloseTo(0.37, 6);
  });

  it('config paths: values, copies and type checks', () => {
    expect(configValue(CONFIG, 'sensors.mpu.noise_g')).toBe(CONFIG.sensors.mpu.noise_g);
    expect(() => configValue(CONFIG, 'thermal.warmStart')).toThrow(/not a number/);
    const c = withValues(CONFIG, { 'fan.tauUp_s': 2, 'thermal.warmStart': false });
    expect([c.fan.tauUp_s, c.thermal.warmStart, CONFIG.fan.tauUp_s]).toEqual([2, false, 0.8]);
    expect(() => withValues(CONFIG, { 'thermal.warmStart': 1 })).toThrow(/not a number/);
  });
});

describe('proposed config diff (P8.4)', () => {
  const source = readFileSync(join(import.meta.dirname, '../../../src/shared/config.ts'), 'utf8');

  it('patches the numbers in place and writes a git-style unified diff', () => {
    const patched = patchConfigSource(source, [
      { key: 'fan.tauUp_s', value: 1.2 },
      { key: 'sensors.adc.noise_counts', value: 2.59 },
      { key: 'thermal.ambient_C', value: 22 },
    ]);
    expect(patched).toContain('tauUp_s: 1.2, tauDown_s: 2.5,');
    expect(patched).toContain('vSpan_V: 3.05, noise_counts: 2.59, inl_counts: 6');
    expect(patched).toContain('ambient_C: 22, overheatAmbientMax_K: 35');
    expect(patched.split('\n')).toHaveLength(source.split('\n').length);
    const diff = unifiedDiff(source, patched, 'src/shared/config.ts');
    expect(diff.startsWith('--- a/src/shared/config.ts\n+++ b/src/shared/config.ts\n@@ -')).toBe(true);
    expect(diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'))).toHaveLength(3);
    expect(diff).toContain('+    tauUp_s: 1.2, tauDown_s: 2.5,');
    expect(unifiedDiff(source, source, 'x')).toBe('');
  });

  it('merges nearby changes into one hunk and refuses what it cannot patch', () => {
    const a = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj';
    const b = 'a\nB\nc\nD\ne\nf\ng\nh\ni\nJ';
    expect(unifiedDiff(a, b, 'x').match(/^@@/gm)).toHaveLength(2); // b and d together, j apart
    expect(() => unifiedDiff(a, `${b}\nk`, 'x')).toThrow(/same number of lines/);
    expect(() => patchConfigSource(source, [{ key: 'nope.x', value: 1 }])).toThrow(/section nope/);
    expect(() => patchConfigSource(source, [{ key: 'fan.nope', value: 1 }])).toThrow(/key fan.nope/);
    expect([roundProposal('fan.rpmRated', 3512.6), roundProposal('fan.tauUp_s', 1.23456)]).toEqual([3513, 1.23]);
  });
});
