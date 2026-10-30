import { describe, expect, it } from 'vitest';
import { fnv1a32, stream } from '../../../src/shared/rng.ts';

const SEED = 20261029;
const take = (n: number, next: () => number) => Array.from({ length: n }, next);

describe('rng', () => {
  it('hashes names with 32-bit FNV-1a', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('same seed + name gives the same 1,000 values', () => {
    const a = stream(SEED, 'mpu');
    const b = stream(SEED, 'mpu');
    expect(take(1000, () => a.uniform())).toEqual(take(1000, () => b.uniform()));
    expect(take(1000, () => a.normal(0, 1))).toEqual(take(1000, () => b.normal(0, 1)));
  });

  it('different names give different sequences', () => {
    const a = take(1000, stream(SEED, 'mpu').uniform);
    const b = take(1000, stream(SEED, 'acs712').uniform);
    expect(a).not.toEqual(b);
    expect(a.filter((x, i) => x === b[i]).length).toBe(0);
  });

  it('different seeds give different sequences', () => {
    expect(take(100, stream(SEED, 'link').uniform)).not.toEqual(take(100, stream(SEED + 1, 'link').uniform));
  });

  it('uniform() stays in [0, 1)', () => {
    const s = stream(SEED, 'uniform');
    const xs = take(100_000, s.uniform);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((acc, x) => acc + x, 0) / xs.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.01);
  });

  it('100,000 normals have mean within 0.01 of 0 and std within 0.01 of 1', () => {
    const s = stream(SEED, 'normal');
    const xs = take(100_000, () => s.normal(0, 1));
    const mean = xs.reduce((acc, x) => acc + x, 0) / xs.length;
    const variance = xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (xs.length - 1);
    expect(xs.every(Number.isFinite)).toBe(true);
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.01);
  });

  it('normal(μ, σ) shifts and scales', () => {
    const a = stream(SEED, 'scaled');
    const b = stream(SEED, 'scaled');
    for (let i = 0; i < 10; i++) expect(a.normal(25, 0.5)).toBeCloseTo(25 + 0.5 * b.normal(0, 1), 12);
  });
});
