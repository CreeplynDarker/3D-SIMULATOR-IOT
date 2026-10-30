import { describe, expect, it } from 'vitest';
import { G0_mps2, gToMps2, mps2ToG, radpsToRpm, rpmToRadps } from '../../../src/shared/units.ts';

describe('units', () => {
  it('converts rpm to rad/s', () => {
    expect(rpmToRadps(60)).toBeCloseTo(2 * Math.PI, 12);
    expect(rpmToRadps(3800)).toBeCloseTo(397.935, 3);
  });

  it('round-trips rpm ↔ rad/s', () => {
    for (const rpm of [0, 1, 100, 600, 3800, 4370.5]) {
      expect(radpsToRpm(rpmToRadps(rpm))).toBeCloseTo(rpm, 9);
    }
  });

  it('converts g to m/s² with standard gravity', () => {
    expect(G0_mps2).toBe(9.80665);
    expect(gToMps2(1)).toBe(9.80665);
    expect(mps2ToG(9.80665)).toBe(1);
  });

  it('round-trips g ↔ m/s²', () => {
    for (const g of [-2, -0.007, 0, 0.02, 0.5, 2]) {
      expect(mps2ToG(gToMps2(g))).toBeCloseTo(g, 12);
    }
  });
});
