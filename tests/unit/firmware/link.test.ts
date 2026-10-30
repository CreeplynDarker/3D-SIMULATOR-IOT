import { describe, expect, it } from 'vitest';
import { createLimits, evaluateLimits, noteVerdict } from '../../../src/firmware/limits.ts';
import { createLink, dueVerdicts, receiveVerdict, sendPacket } from '../../../src/firmware/link.ts';
import { CONFIG } from '../../../src/shared/config.ts';
import { type Packet, PROTOCOL_VERSION, type Verdict } from '../../../src/shared/protocol.ts';

const DT = CONFIG.physics.dt_s;

const packet = (seq: number): Packet => ({
  v: PROTOCOL_VERSION,
  kind: 'packet',
  seq,
  ts_ms: (seq + 1) * 1000,
  win_ms: 1000,
  a_rms_g: 0.12,
  cf: 2.5,
  i_rms_A: 0.18,
  t_C: 34,
  dtdt_C_per_min: 0,
  rpm: 3800,
  state: 'NORMAL',
  relay_ch2: 'ON',
  link_lost: false,
  sensor_fault: false,
  warn_reason: null,
  trip_reason: null,
});

const verdictFor = (p: Packet): Verdict => ({
  v: PROTOCOL_VERSION,
  kind: 'verdict',
  seq_ref: p.seq,
  score: 0.2,
  threshold: 0.5,
  alert: false,
  clear: true,
  dominant: 'cf',
  z: null,
  model: 'READY',
});

/**
 * Runs windows ending at 1, 2, … `end_s` with a synthetic RCF that answers each packet at once; steps time at the
 * physics rate to deliver verdicts. `loss(t)` gives the packet loss at window end t. Returns delivery records and the
 * time link_lost was first raised and first cleared.
 */
function run(end_s: number, loss: (t: number) => number) {
  const link = createLink(CONFIG.seed, CONFIG);
  const limits = createLimits(0);
  const deliveries: { seq: number; delay_s: number }[] = [];
  let lostAt: number | null = null;
  let restoredAt: number | null = null;
  for (let step = 1; step <= Math.round(end_s / DT); step++) {
    const t = step * DT;
    for (const v of dueVerdicts(link, t)) {
      deliveries.push({ seq: v.seq_ref, delay_s: t - (v.seq_ref + 1) });
      if (noteVerdict(limits, t) && restoredAt === null) restoredAt = t;
    }
    if (step % Math.round(1 / DT) === 0) {
      const seq = Math.round(t) - 1;
      const p = packet(seq);
      sendPacket(link, p, t, loss(t), (sent) => receiveVerdict(link, verdictFor(sent), t));
      const r = evaluateLimits(limits, { state: 'NORMAL', tEnd_s: t, i_rms_A: 0.18, rpm: 3800, t_C: 34, lastValidTemp_s: t }, CONFIG); // prettier-ignore
      if (r.linkLost && lostAt === null) lostAt = t;
    }
  }
  return { deliveries, lostAt, restoredAt, link };
}

describe('link (§7.5)', () => {
  it('delivers each verdict 20 ± 10 ms after its window end', () => {
    const { deliveries } = run(200, () => 0);
    expect(deliveries).toHaveLength(199); // the verdict for the window ending at 200 s is still in flight
    for (const d of deliveries) {
      expect(d.delay_s).toBeGreaterThanOrEqual(CONFIG.link.latency_s - CONFIG.link.latencyJitter_s - DT);
      expect(d.delay_s).toBeLessThanOrEqual(CONFIG.link.latency_s + CONFIG.link.latencyJitter_s + DT);
    }
    const spread = Math.max(...deliveries.map((d) => d.delay_s)) - Math.min(...deliveries.map((d) => d.delay_s));
    expect(spread).toBeGreaterThan(0.01); // jitter is really drawn
  });

  it('packetLoss 1.0 → link_lost within 5 s + 1 window; the first verdict after restore clears it', () => {
    const { lostAt, restoredAt } = run(60, (t) => (t > 30 && t <= 50 ? 1 : 0));
    // the last verdict arrives ≈ 30.02 s; the loss timeout is 5 s and limits run at window ends
    expect(lostAt).not.toBeNull();
    expect(lostAt ?? 0).toBeLessThanOrEqual(30 + CONFIG.link.lossTimeout_s + CONFIG.firmware.window_s);
    expect(lostAt ?? 0).toBeGreaterThan(30 + CONFIG.link.lossTimeout_s);
    expect(restoredAt).not.toBeNull();
    expect(restoredAt ?? 0).toBeGreaterThan(51);
    expect(restoredAt ?? 0).toBeLessThan(51.04);
  });

  it('drops packets with probability packetLoss; a dropped packet gets no verdict', () => {
    const { deliveries, link } = run(400, () => 0.5);
    expect(link.dropped + link.sent).toBe(400);
    expect(link.dropped / 400).toBeGreaterThan(0.4);
    expect(link.dropped / 400).toBeLessThan(0.6);
    // every sent packet gets its verdict, except possibly the last one, still in flight at the end
    expect(deliveries.length).toBeGreaterThanOrEqual(link.sent - 1);
    expect(deliveries.length).toBeLessThanOrEqual(link.sent);
  });

  it('holds a late RCF answer until it arrives', () => {
    const link = createLink(CONFIG.seed, CONFIG);
    const p = packet(9);
    sendPacket(link, p, 10, 0, () => undefined);
    receiveVerdict(link, verdictFor(p), 10.5); // the RCF answered 0.5 s late
    expect(dueVerdicts(link, 10.1)).toEqual([]);
    expect(dueVerdicts(link, 10.5).map((v) => v.seq_ref)).toEqual([9]);
    expect(dueVerdicts(link, 11)).toEqual([]);
  });

  it('delivers an unsolicited verdict (no packet on record) on arrival', () => {
    const link = createLink(CONFIG.seed, CONFIG);
    receiveVerdict(link, verdictFor(packet(3)), 4);
    expect(dueVerdicts(link, 4).map((v) => v.seq_ref)).toEqual([3]);
  });

  it('is deterministic for a seed', () => {
    const a = run(50, () => 0.3).deliveries;
    expect(run(50, () => 0.3).deliveries).toEqual(a);
  });
});
