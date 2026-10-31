import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadModel, MODEL_VERSION, scoreVector } from '../../../src/rcf/model.ts';
import { fitNormaliser, normalise } from '../../../src/rcf/normalise.ts';
import { CONFIG } from '../../../src/shared/config.ts';
import type { FeatureKey } from '../../../src/shared/protocol.ts';

interface Dataset {
  seed: number;
  numTrees: number;
  features: FeatureKey[];
  stdFloor: number[];
  train: number[][];
  test: { label: string; row: number[] }[];
  reference: { rrcf: string; scores: number[] } | null;
}

const FILE = join(import.meta.dirname, '../../fixtures/rcf_dataset.json');
const SCRIPT = join(import.meta.dirname, '../../../scripts/rrcf_reference.py');
const ds = JSON.parse(readFileSync(FILE, 'utf8')) as Dataset;

/** TS scores of the test windows with a forest built the §9.3 way from the dataset's training windows. */
function tsScores(d: Dataset): number[] {
  const norm = fitNormaliser(d.train, d.stdFloor);
  const model = loadModel({
    version: MODEL_VERSION,
    seed: d.seed,
    features: d.features,
    mean: norm.mean,
    std: norm.std,
    stdFloor: norm.floor,
    numTrees: d.numTrees,
    trainZ: d.train.map((r) => normalise(r, norm)),
    threshold: CONFIG.rcf.threshold,
    nTrain: d.train.length,
    holdoutMax: 0,
    source: 'rcf_dataset',
  });
  return d.test.map((t) => scoreVector(model, t.row).score);
}

/** Ranks from 1, ties sharing their average rank. */
function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && (order[j + 1] as readonly [number, number])[0] === (order[i] as readonly [number, number])[0]) j++; // prettier-ignore
    for (let k = i; k <= j; k++) out[(order[k] as readonly [number, number])[1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation (unitless, −1…1). */
function spearman(a: number[], b: number[]): number {
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    const x = (ra[i] as number) - ma;
    const y = (rb[i] as number) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return num / Math.sqrt(da * db);
}

/** A Python with numpy and rrcf 0.4.4, from RRCF_PYTHON or python3, or null. */
function python(): string | null {
  for (const exe of [process.env['RRCF_PYTHON'], 'python3']) {
    if (!exe) continue;
    const r = spawnSync(exe, ['-I', '-W', 'ignore', '-c', 'import numpy, rrcf; assert rrcf.__version__ == "0.4.4"']);
    if (r.status === 0) return exe;
  }
  return null;
}
const PY = python();

describe('Python rrcf cross-check (P4.6)', () => {
  it('the dataset has 120 healthy training windows and 60 test windows (healthy and four faults)', () => {
    expect(ds.train).toHaveLength(CONFIG.rcf.nTrain);
    expect(ds.test).toHaveLength(60);
    expect(new Set(ds.test.map((t) => t.label))).toEqual(new Set(['healthy', 'imbalance', 'looseness', 'friction', 'overheat'])); // prettier-ignore
    expect(ds.numTrees).toBe(40);
  });

  it('TS scores rank like Python rrcf 0.4.4 scores: Spearman ≥ 0.90', () => {
    expect(ds.reference?.rrcf).toBe('0.4.4');
    const rho = spearman(tsScores(ds), ds.reference?.scores ?? []);
    expect(rho).toBeGreaterThanOrEqual(0.9);
  });

  it('spearman: perfect, reversed and tied ranks', () => {
    expect(spearman([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 12);
    expect(ranks([5, 1, 5, 2])).toEqual([3.5, 1, 3.5, 2]);
  });

  it.skipIf(PY === null)('re-running scripts/rrcf_reference.py reproduces the stored reference', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rrcf-'));
    const copy = join(dir, 'rcf_dataset.json');
    copyFileSync(FILE, copy);
    const r = spawnSync(PY as string, ['-I', SCRIPT, copy], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const fresh = JSON.parse(readFileSync(copy, 'utf8')) as Dataset;
    const stored = ds.reference?.scores ?? [];
    fresh.reference?.scores.forEach((s, i) => expect(s).toBeCloseTo(stored[i] as number, 9));
  });
});
