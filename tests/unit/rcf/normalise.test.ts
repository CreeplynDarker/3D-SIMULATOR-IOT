import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fitNormaliser, floorsFor, normalise } from '../../../src/rcf/normalise.ts';
import { CONFIG } from '../../../src/shared/config.ts';
import type { FeatureKey } from '../../../src/shared/protocol.ts';

interface Fixture {
  features: FeatureKey[];
  rows: number[][];
  reference: { mean: number[]; std: number[] };
}

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../fixtures/normalise.json'), 'utf8'),
) as Fixture;

const relClose = (a: number, b: number) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));

describe('normalise (§9.2)', () => {
  it('μ and population σ match NumPy on the fixture', () => {
    const norm = fitNormaliser(fixture.rows, floorsFor(fixture.features, CONFIG));
    norm.mean.forEach((m, k) => expect(relClose(m, fixture.reference.mean[k] as number)).toBe(true));
    norm.std.forEach((s, k) => expect(relClose(s, fixture.reference.std[k] as number)).toBe(true));
  });

  it('floors apply: z divides by max(σ, stdFloor)', () => {
    const floors = floorsFor(fixture.features, CONFIG);
    expect(floors).toEqual([0.005, 0.05, 0.002, 0.1, 0.05, 15]);
    const norm = fitNormaliser(fixture.rows, floors);
    const x = norm.mean.map((m) => m + 1);
    const z = normalise(x, norm);
    // a_rms (σ 0.0039 < 0.005), t_C (σ 0.030 < 0.1) and the constant dT/dt column use the floor; the others use σ.
    expect(z[0]).toBeCloseTo(1 / 0.005, 9);
    expect(z[3]).toBeCloseTo(1 / 0.1, 9);
    expect(z[4]).toBeCloseTo(1 / 0.05, 9);
    expect(z[1]).toBeCloseTo(1 / (norm.std[1] as number), 9);
    expect(z[2]).toBeCloseTo(1 / (norm.std[2] as number), 9);
    expect(z[5]).toBeCloseTo(1 / (norm.std[5] as number), 9);
  });

  it('a training row at the mean gives z = 0, and floors follow the feature list', () => {
    const norm = fitNormaliser([[1, 2], [3, 4]], [0.5, 0.5]); // prettier-ignore
    expect(norm.mean).toEqual([2, 3]);
    expect(norm.std).toEqual([1, 1]);
    expect(normalise([2, 3], norm)).toEqual([0, 0]);
    expect(floorsFor(['rpm', 'cf'], CONFIG)).toEqual([15, 0.05]);
  });

  it('rejects an empty training set and rows of the wrong width', () => {
    expect(() => fitNormaliser([], [1])).toThrow();
    expect(() => fitNormaliser([[1, 2]], [1])).toThrow();
  });
});
