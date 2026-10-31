import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRcfService } from '../../../src/rcf/service.ts';
import { CONFIG } from '../../../src/shared/config.ts';
import { type Packet, PROTOCOL_VERSION, type State, Verdict } from '../../../src/shared/protocol.ts';
import { stream } from '../../../src/shared/rng.ts';

const MODEL_TEXT = readFileSync(join(import.meta.dirname, '../../../public/models/default-model.json'), 'utf8');
const N = CONFIG.rcf.nTrain + CONFIG.rcf.nHoldout;

function packet(seq: number, state: State = 'NORMAL', extra: Partial<Packet> = {}): Packet {
  return {
    v: PROTOCOL_VERSION,
    kind: 'packet',
    seq,
    ts_ms: (seq + 1) * 1000,
    win_ms: 1000,
    a_rms_g: 0.1205,
    cf: 2.5,
    i_rms_A: 0.181,
    t_C: 33.9,
    dtdt_C_per_min: -0.1,
    rpm: 3800,
    state,
    relay_ch2: 'ON',
    link_lost: false,
    sensor_fault: false,
    warn_reason: null,
    trip_reason: null,
    ...extra,
  };
}

/** Healthy-looking packets with a little seeded noise on every feature. */
function healthy(n: number, from = 0): Packet[] {
  const rng = stream(CONFIG.seed, 'service-test');
  return Array.from({ length: n }, (_, i) =>
    packet(from + i, 'NORMAL', {
      a_rms_g: rng.normal(0.1205, 0.002),
      cf: rng.normal(2.5, 0.15),
      i_rms_A: rng.normal(0.181, 0.0015),
      t_C: rng.normal(33.8, 0.3),
      dtdt_C_per_min: rng.normal(-0.2, 0.3),
      rpm: rng.normal(3800, 15),
    }),
  );
}

describe('RCF service (worker logic, §9.3, §10.2)', () => {
  it('starts UNTRAINED, answering every packet with an unscored verdict', () => {
    const svc = createRcfService(CONFIG);
    expect(svc.status()).toMatchObject({ status: 'UNTRAINED', progress: 0 });
    const out = svc.packet(packet(3));
    expect(out.verdict).toMatchObject({ seq_ref: 3, score: null, model: 'UNTRAINED', threshold: CONFIG.rcf.threshold });
    expect(out.status).toBeNull();
  });

  it('loads the default model (READY) and scores only NORMAL/WARNING packets with no null feature', () => {
    const svc = createRcfService(CONFIG);
    expect(svc.load(MODEL_TEXT)).toEqual({ status: 'READY', progress: 1 });
    const scored = svc.packet(packet(1)).verdict;
    expect(scored.score).not.toBeNull();
    expect(scored.model).toBe('READY');
    expect(Verdict.safeParse(scored).success).toBe(true);
    expect(svc.packet(packet(2, 'WARNING')).verdict.score).not.toBeNull();
    for (const p of [packet(3, 'STARTING'), packet(4, 'CRITICAL'), packet(5, 'NORMAL', { t_C: null })]) {
      expect(svc.packet(p).verdict).toMatchObject({ score: null, alert: false, model: 'READY' });
    }
  });

  it('a malformed model leaves it UNTRAINED with a reason', () => {
    const svc = createRcfService(CONFIG);
    const st = svc.load('{"version":1}');
    expect(st.status).toBe('UNTRAINED');
    expect(st.reason).toMatch(/^model rejected/);
  });

  it('setThreshold changes the verdict threshold, with or without a model', () => {
    const svc = createRcfService(CONFIG);
    svc.setThreshold(0.6);
    expect(svc.packet(packet(1)).verdict.threshold).toBe(0.6);
    svc.load(MODEL_TEXT);
    svc.setThreshold(0.45);
    expect(svc.packet(packet(2)).verdict.threshold).toBe(0.45);
  });

  it('train: TRAINING with n/180 progress on each collected window, then READY', () => {
    const svc = createRcfService(CONFIG);
    svc.load(MODEL_TEXT);
    expect(svc.train()).toEqual({ status: 'TRAINING', progress: 0 });
    // Waiting for NORMAL changes nothing; scoring is paused while training.
    expect(svc.packet(packet(0, 'STARTING'))).toMatchObject({
      status: null,
      verdict: { score: null, model: 'TRAINING' },
    });
    const pk = healthy(N, 1);
    const first = svc.packet(pk[0] as Packet);
    expect(first.status).toEqual({ status: 'TRAINING', progress: 1 / N });
    let last = first;
    for (const p of pk.slice(1)) last = svc.packet(p);
    expect(last.status).toEqual({ status: 'READY', progress: 1 });
    expect(svc.packet(packet(500)).verdict).toMatchObject({ model: 'READY' });
    expect(svc.packet(packet(501)).verdict.score).not.toBeNull();
  });

  it('training aborts (UNTRAINED) if the state leaves NORMAL', () => {
    const svc = createRcfService(CONFIG);
    svc.train();
    svc.packet(healthy(1)[0] as Packet);
    const out = svc.packet(packet(2, 'WARNING'));
    expect(out.status).toEqual({ status: 'UNTRAINED', progress: 0, reason: 'training aborted: state left NORMAL (WARNING)' }); // prettier-ignore
    expect(svc.packet(packet(3)).verdict).toMatchObject({ score: null, model: 'UNTRAINED' });
  });

  it('a training run with an unstable baseline ends UNTRAINED (baseline unstable)', () => {
    const svc = createRcfService(CONFIG);
    svc.train();
    const pk = healthy(N);
    // A holdout far noisier than the training windows.
    const rng = stream(CONFIG.seed, 'noisy');
    let last = svc.packet(pk[0] as Packet);
    for (const [i, p] of pk.slice(1).entries()) {
      const noisy = i + 1 >= CONFIG.rcf.nTrain ? { ...p, a_rms_g: Math.abs(rng.normal(0.12, 0.2)) } : p;
      last = svc.packet(noisy);
    }
    expect(last.status).toMatchObject({ status: 'UNTRAINED', reason: 'baseline unstable' });
  });
});
