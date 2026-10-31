// Feature normalisation (spec §9.2): z_k = (x_k − μ_k) / max(σ_k, stdFloor_k), with μ and the population σ taken
// from the training windows. Each feature keeps its own unit in x, μ, σ and the floor; z is unitless.
import type { FeatureKey } from '../shared/protocol.ts';
import type { SimConfig } from '../sim/types.ts';

export interface Normaliser {
  /** Per-feature training mean (feature units). */
  mean: number[];
  /** Per-feature population standard deviation, before the floor (feature units). */
  std: number[];
  /** Per-feature floor on the divisor (feature units). */
  floor: number[];
}

/** The `rcf.stdFloor` value for each feature, in feature order (feature units). */
export function floorsFor(features: readonly FeatureKey[], cfg: SimConfig): number[] {
  return features.map((k) => cfg.rcf.stdFloor[k]);
}

/** Fits μ and the population σ (ddof = 0) of each column of `rows` (feature units). */
export function fitNormaliser(rows: readonly (readonly number[])[], floor: readonly number[]): Normaliser {
  if (rows.length === 0) throw new Error('normalise: no training rows');
  const dims = floor.length;
  if (rows.some((r) => r.length !== dims)) throw new Error(`normalise: every row needs ${dims} values`);
  const mean = floor.map((_, k) => rows.reduce((s, r) => s + (r[k] as number), 0) / rows.length);
  const std = mean.map((m, k) => Math.sqrt(rows.reduce((s, r) => s + ((r[k] as number) - m) ** 2, 0) / rows.length));
  return { mean, std, floor: [...floor] };
}

/** z-scores of one feature vector `x` (unitless). */
export function normalise(x: readonly number[], norm: Normaliser): number[] {
  return x.map((v, k) => (v - (norm.mean[k] as number)) / Math.max(norm.std[k] as number, norm.floor[k] as number));
}
