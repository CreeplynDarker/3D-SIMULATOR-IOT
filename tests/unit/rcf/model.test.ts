import { describe, expect, it } from 'vitest';
import {
  createTrainer,
  featureVector,
  fitModel,
  loadModel,
  parseModelJson,
  scorePacket,
  serialiseModel,
  trainerAdd,
} from '../../../src/rcf/model.ts';
import { CONFIG } from '../../../src/shared/config.ts';
import { type FeatureKey, type Packet, PROTOCOL_VERSION, type State, Verdict } from '../../../src/shared/protocol.ts';
import { stream } from '../../../src/shared/rng.ts';

const SEED = 20261029;
const FEATURES = CONFIG.rcf.features;
const N_ROWS = CONFIG.rcf.nTrain + CONFIG.rcf.nHoldout;
// Healthy window statistics close to the plant's: mean and spread per feature (feature units).
const HEALTHY: Record<FeatureKey, [number, number]> = {
  a_rms_g: [0.1205, 0.004],
  cf: [3.1, 0.2],
  i_rms_A: [0.18, 0.003],
  t_C: [34.07, 0.03],
  dtdt_C_per_min: [0, 0.03],
  rpm: [3800, 20],
};

function packet(seq: number, values: Partial<Record<FeatureKey, number | null>> = {}, state: State = 'NORMAL'): Packet {
  return {
    v: PROTOCOL_VERSION,
    kind: 'packet',
    seq,
    ts_ms: (seq + 1) * 1000,
    win_ms: 1000,
    a_rms_g: 0.12,
    cf: 3,
    i_rms_A: 0.18,
    t_C: 34,
    dtdt_C_per_min: 0,
    rpm: 3800,
    state,
    relay_ch2: 'ON',
    link_lost: false,
    sensor_fault: false,
    warn_reason: null,
    trip_reason: null,
    ...values,
  } as Packet;
}

/** `n` healthy feature rows; `spread` scales the noise (1 = healthy). */
function healthyRows(n: number, name: string, spread = 1): number[][] {
  const rng = stream(SEED, name);
  return Array.from({ length: n }, () => FEATURES.map((k) => rng.normal(HEALTHY[k][0], HEALTHY[k][1] * spread)));
}

const asPacket = (row: number[], seq: number, state: State = 'NORMAL') =>
  packet(seq, Object.fromEntries(FEATURES.map((k, i) => [k, row[i] as number])), state);

function readyModel() {
  const fit = fitModel(healthyRows(N_ROWS, 'baseline'), CONFIG, SEED, 'test');
  if (fit.status !== 'READY') throw new Error(`baseline rejected: ${fit.reason}`);
  return fit;
}

describe('RCF model (§9.3)', () => {
  it('train → serialise → load gives identical scores', () => {
    const fit = readyModel();
    const text = serialiseModel(fit.model);
    const loaded = loadModel(parseModelJson(text));
    const probes = [...healthyRows(20, 'probe'), ...healthyRows(10, 'probe-wide', 8)];
    const a = probes.map((r, i) => scorePacket(fit.model, asPacket(r, i), CONFIG, 'READY'));
    const b = probes.map((r, i) => scorePacket(loaded, asPacket(r, i), CONFIG, 'READY'));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(serialiseModel(loaded)).toBe(text);
  });

  it('serialises { version, seed, features, mean, std, trainZ, threshold, nTrain, holdoutMax, source }', () => {
    const { model, holdoutMax } = readyModel();
    const json = JSON.parse(serialiseModel(model)) as Record<string, unknown>;
    for (const key of [
      'version',
      'seed',
      'features',
      'mean',
      'std',
      'trainZ',
      'threshold',
      'nTrain',
      'holdoutMax',
      'source',
    ]) {
      expect(json).toHaveProperty(key);
    }
    expect(json['features']).toEqual([...FEATURES]);
    expect(json['nTrain']).toBe(CONFIG.rcf.nTrain);
    expect((json['trainZ'] as number[][]).length).toBe(CONFIG.rcf.nTrain);
    expect(json['threshold']).toBe(CONFIG.rcf.threshold);
    expect(json['holdoutMax']).toBe(holdoutMax);
    expect(holdoutMax).toBeLessThan(CONFIG.rcf.holdoutMaxRatio * CONFIG.rcf.threshold);
  });

  it('null features, or a state other than NORMAL/WARNING, give score = null', () => {
    const { model } = readyModel();
    for (const p of [
      packet(1, { t_C: null }),
      packet(2, { dtdt_C_per_min: null }),
      packet(3, {}, 'STARTING'),
      packet(4, {}, 'CRITICAL'),
    ]) {
      // prettier-ignore
      const v = scorePacket(model, p, CONFIG, 'READY');
      expect(v).toMatchObject({ seq_ref: p.seq, score: null, alert: false, clear: false, dominant: null, z: null });
      expect(Verdict.safeParse(v).success).toBe(true);
    }
    expect(featureVector(packet(5, { t_C: null }), FEATURES)).toBeNull();
    expect(scorePacket(null, packet(6), CONFIG, 'UNTRAINED')).toMatchObject({ score: null, model: 'UNTRAINED' });
  });

  it('scores healthy windows low and a fault high, with the dominant variable and the full z map', () => {
    const { model } = readyModel();
    const healthy = healthyRows(30, 'healthy-probe').map((r, i) => scorePacket(model, asPacket(r, i), CONFIG, 'READY'));
    for (const v of healthy) {
      expect(v.score ?? 1).toBeLessThan(CONFIG.rcf.threshold);
      expect(v.alert).toBe(false);
    }
    const imbalance = scorePacket(model, packet(99, { a_rms_g: 0.6 }, 'WARNING'), CONFIG, 'READY');
    expect(imbalance.score ?? 0).toBeGreaterThan(CONFIG.rcf.threshold);
    expect(imbalance).toMatchObject({ alert: true, clear: false, dominant: 'a_rms_g', model: 'READY' });
    expect(Object.keys(imbalance.z ?? {})).toEqual([...FEATURES]);
    expect(Verdict.safeParse(imbalance).success).toBe(true);
    // clear = score < clearHysteresis · threshold
    const quiet = healthy.find((v) => (v.score ?? 1) < CONFIG.firmware.clearHysteresis * CONFIG.rcf.threshold);
    expect(quiet?.clear).toBe(true);
  });

  it('honours a changed threshold', () => {
    const { model } = readyModel();
    model.threshold = 0.01;
    const v = scorePacket(model, packet(1, { a_rms_g: 0.13 }), CONFIG, 'READY');
    expect(v.threshold).toBe(0.01);
    expect(v.alert).toBe((v.score ?? 0) > 0.01);
  });

  it('holdout validation rejects a deliberately noisy baseline', () => {
    const rows = [...healthyRows(CONFIG.rcf.nTrain, 'quiet'), ...healthyRows(CONFIG.rcf.nHoldout, 'noisy', 30)];
    const fit = fitModel(rows, CONFIG, SEED, 'test');
    expect(fit.status).toBe('UNTRAINED');
    if (fit.status === 'UNTRAINED') expect(fit.reason).toBe('baseline unstable');
    expect(fit.holdoutMax).toBeGreaterThanOrEqual(CONFIG.rcf.holdoutMaxRatio * CONFIG.rcf.threshold);
  });

  it('rejects malformed model JSON and the wrong number of training rows', () => {
    expect(() => parseModelJson('{"version":1}')).toThrow();
    expect(() => parseModelJson('not json')).toThrow();
    expect(() => fitModel(healthyRows(10, 'short'), CONFIG, SEED, 'test')).toThrow();
  });
});

describe('training flow (§9.3)', () => {
  it('collects nTrain + nHoldout NORMAL packets with no null feature, reporting progress, then fits', () => {
    const trainer = createTrainer(CONFIG);
    const rows = healthyRows(N_ROWS, 'baseline');
    // Before the first NORMAL packet it waits; null-feature packets are skipped.
    expect(trainerAdd(trainer, packet(0, {}, 'STARTING'), CONFIG, SEED, 'live')).toEqual({ kind: 'collecting', progress: 0 }); // prettier-ignore
    expect(trainerAdd(trainer, packet(1, { t_C: null }), CONFIG, SEED, 'live')).toEqual({ kind: 'collecting', progress: 0 }); // prettier-ignore
    let last = trainerAdd(trainer, asPacket(rows[0] as number[], 2), CONFIG, SEED, 'live');
    expect(last).toEqual({ kind: 'collecting', progress: 1 / N_ROWS });
    for (let i = 1; i < N_ROWS; i++) last = trainerAdd(trainer, asPacket(rows[i] as number[], i + 2), CONFIG, SEED, 'live'); // prettier-ignore
    expect(last.kind).toBe('done');
    if (last.kind !== 'done' || last.result.status !== 'READY') throw new Error('training failed');
    // Same rows, same seed → the same model as fitting directly.
    expect(serialiseModel(last.result.model)).toBe(serialiseModel(fitModel(rows, CONFIG, SEED, 'live').model ?? last.result.model)); // prettier-ignore
  });

  it('aborts if the state leaves NORMAL', () => {
    const trainer = createTrainer(CONFIG);
    trainerAdd(trainer, packet(0), CONFIG, SEED, 'live');
    expect(trainerAdd(trainer, packet(1, {}, 'WARNING'), CONFIG, SEED, 'live')).toEqual({
      kind: 'aborted',
      reason: 'state left NORMAL (WARNING)',
    });
  });
});
