// RCF model (spec §9.3): training on healthy NORMAL windows, holdout validation, scoring one packet into a verdict,
// and a JSON form that rebuilds the same forest. Scores are unitless: mean CoDisp ÷ nTrain (D-004).
import { z } from 'zod';
import { FeatureKey, type Packet, PROTOCOL_VERSION, type Verdict } from '../shared/protocol.ts';
import { stream } from '../shared/rng.ts';
import type { ModelStatus } from '../shared/messages.ts';
import type { SimConfig } from '../sim/types.ts';
import { fitNormaliser, floorsFor, normalise, type Normaliser } from './normalise.ts';
import { RCTree } from './rrcf.ts';

export const MODEL_VERSION = 1;
const TMP_KEY = 'tmp';

/** Saved model (spec §9.3), plus `numTrees` and `stdFloor` so a load never depends on the current config. */
export const ModelJson = z.object({
  version: z.literal(MODEL_VERSION),
  seed: z.number().int(),
  features: z.array(FeatureKey).min(1),
  mean: z.array(z.number().finite()),
  std: z.array(z.number().finite().nonnegative()),
  stdFloor: z.array(z.number().finite().positive()),
  numTrees: z.number().int().positive(),
  trainZ: z.array(z.array(z.number().finite())).min(1),
  threshold: z.number().positive(),
  nTrain: z.number().int().positive(),
  holdoutMax: z.number().finite().nonnegative(),
  source: z.string(),
});
export type ModelJson = z.infer<typeof ModelJson>;

export interface RcfModel {
  json: ModelJson;
  norm: Normaliser;
  forest: RCTree[];
  /** Alert threshold on the normalised score (unitless); `setThreshold` changes it. */
  threshold: number;
}

export type FitResult =
  | { status: 'READY'; model: RcfModel; holdoutMax: number }
  | { status: 'UNTRAINED'; model: null; holdoutMax: number; reason: string };

/** `rcf.features` as protocol feature keys (the sim config widens them to strings). */
export function configFeatures(cfg: SimConfig): FeatureKey[] {
  return cfg.rcf.features.map((k) => FeatureKey.parse(k));
}

/** The packet's feature values in `features` order (feature units), or null if any is null. */
export function featureVector(packet: Packet, features: readonly FeatureKey[]): number[] | null {
  const x: number[] = [];
  for (const k of features) {
    const v = packet[k];
    if (v === null) return null;
    x.push(v);
  }
  return x;
}

/** `numTrees` trees, tree i on stream `rcf-tree-<i>`, each holding every training z-point under keys 0…n−1. */
function buildForest(trainZ: readonly (readonly number[])[], seed: number, numTrees: number): RCTree[] {
  return Array.from({ length: numTrees }, (_, i) => {
    const tree = new RCTree(stream(seed, `rcf-tree-${i}`));
    trainZ.forEach((zp, key) => tree.insertPoint(zp, key));
    return tree;
  });
}

/** Rebuilds the forest from a saved model; it scores bit-for-bit like the model that was saved. */
export function loadModel(json: ModelJson): RcfModel {
  const norm: Normaliser = { mean: [...json.mean], std: [...json.std], floor: [...json.stdFloor] };
  return { json, norm, forest: buildForest(json.trainZ, json.seed, json.numTrees), threshold: json.threshold };
}

/** Parses and validates model JSON text; throws on anything malformed. */
export function parseModelJson(text: string): ModelJson {
  const json = ModelJson.parse(JSON.parse(text));
  const dims = json.features.length;
  const widths = [json.mean, json.std, json.stdFloor, ...json.trainZ].map((a) => a.length);
  if (widths.some((w) => w !== dims) || json.trainZ.length !== json.nTrain)
    throw new Error('model: inconsistent sizes');
  return json;
}

/** JSON text of the model, with its current threshold. */
export function serialiseModel(model: RcfModel): string {
  return JSON.stringify({ ...model.json, threshold: model.threshold });
}

/** Score of one feature vector: mean over trees of codisp("tmp") ÷ nTrain (unitless, 0…1), and its z-scores. */
export function scoreVector(model: RcfModel, x: readonly number[]): { score: number; z: number[] } {
  const zp = normalise(x, model.norm);
  let sum = 0;
  for (const tree of model.forest) {
    tree.insertPoint(zp, TMP_KEY);
    sum += tree.codisp(TMP_KEY);
    tree.forgetPoint(TMP_KEY);
  }
  return { score: sum / model.forest.length / model.json.nTrain, z: zp };
}

/** Verdict for one packet; unscored (score null) without a model, outside NORMAL/WARNING or with a null feature. */
export function scorePacket(model: RcfModel | null, packet: Packet, cfg: SimConfig, status: ModelStatus): Verdict {
  const threshold = model?.threshold ?? cfg.rcf.threshold;
  const base = { v: PROTOCOL_VERSION, kind: 'verdict', seq_ref: packet.seq, threshold, model: status } as const;
  const scored = packet.state === 'NORMAL' || packet.state === 'WARNING';
  const x = model && scored ? featureVector(packet, model.json.features) : null;
  if (model === null || x === null)
    return { ...base, score: null, alert: false, clear: false, dominant: null, z: null };
  const { score, z: zp } = scoreVector(model, x);
  let dom = 0;
  zp.forEach((v, k) => {
    if (Math.abs(v) > Math.abs(zp[dom] as number)) dom = k;
  });
  return {
    ...base,
    score,
    alert: score > threshold,
    clear: score < cfg.firmware.clearHysteresis * threshold,
    dominant: model.json.features[dom] as FeatureKey,
    z: Object.fromEntries(model.json.features.map((k, i) => [k, zp[i] as number])),
  };
}

/**
 * Fits a model on `nTrain + nHoldout` healthy rows (feature units, `rcf.features` order): μ/σ and the forest from the
 * first nTrain, then validation on the holdout. A READY model is rebuilt from its JSON, so it scores like a loaded one.
 */
export function fitModel(
  rows: readonly (readonly number[])[],
  cfg: SimConfig,
  seed: number,
  source: string,
): FitResult {
  const { nTrain, nHoldout, numTrees, threshold, holdoutMaxRatio } = cfg.rcf;
  if (rows.length !== nTrain + nHoldout) throw new Error(`model: need ${nTrain + nHoldout} rows, got ${rows.length}`);
  const features = configFeatures(cfg);
  const norm = fitNormaliser(rows.slice(0, nTrain), floorsFor(features, cfg));
  const json: ModelJson = {
    version: MODEL_VERSION,
    seed,
    features,
    mean: norm.mean,
    std: norm.std,
    stdFloor: norm.floor,
    numTrees,
    trainZ: rows.slice(0, nTrain).map((r) => normalise(r, norm)),
    threshold,
    nTrain,
    holdoutMax: 0,
    source,
  };
  const probe = loadModel(json);
  json.holdoutMax = Math.max(...rows.slice(nTrain).map((r) => scoreVector(probe, r).score));
  if (json.holdoutMax >= holdoutMaxRatio * threshold) {
    return { status: 'UNTRAINED', model: null, holdoutMax: json.holdoutMax, reason: 'baseline unstable' };
  }
  return { status: 'READY', model: loadModel(json), holdoutMax: json.holdoutMax };
}

export interface Trainer {
  /** Feature rows collected so far (feature units). */
  rows: number[][];
  target: number;
}

export type TrainStep =
  { kind: 'collecting'; progress: number } | { kind: 'aborted'; reason: string } | { kind: 'done'; result: FitResult };

/** A training run that waits for NORMAL, then collects `nTrain + nHoldout` windows. */
export function createTrainer(cfg: SimConfig): Trainer {
  return { rows: [], target: cfg.rcf.nTrain + cfg.rcf.nHoldout };
}

/** Feeds one packet to the trainer; leaving NORMAL after collection began aborts, a null feature is skipped. */
export function trainerAdd(t: Trainer, packet: Packet, cfg: SimConfig, seed: number, source: string): TrainStep {
  if (packet.state !== 'NORMAL') {
    if (t.rows.length === 0) return { kind: 'collecting', progress: 0 };
    return { kind: 'aborted', reason: `state left NORMAL (${packet.state})` };
  }
  const x = featureVector(packet, configFeatures(cfg));
  if (x !== null) t.rows.push(x);
  if (t.rows.length < t.target) return { kind: 'collecting', progress: t.rows.length / t.target };
  return { kind: 'done', result: fitModel(t.rows, cfg, seed, source) };
}
