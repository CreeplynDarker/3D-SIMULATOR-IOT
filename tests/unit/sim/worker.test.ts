// The sim worker (spec §10.2) run in Node: `self` is a stand-in worker scope and Vitest's fake timers drive both
// setInterval and performance.now, so wall time is under the test's control.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import type { MainToSim, SimToMain, Snapshot } from '../../../src/shared/messages.ts';
import { type Packet, PROTOCOL_VERSION, type Verdict } from '../../../src/shared/protocol.ts';

type Batchable = SimToMain | { type: 'batch'; messages: SimToMain[] };

let out: SimToMain[] = [];
let posts = 0; // postMessage calls (a batch counts once)
let scope: { postMessage: (m: Batchable) => void; onmessage: ((e: { data: MainToSim }) => void) | null };
let port: { postMessage: ReturnType<typeof vi.fn>; onmessage: ((e: { data: unknown }) => void) | null };

const send = (m: MainToSim) => scope.onmessage?.({ data: m });
const wall = (ms: number) => vi.advanceTimersByTime(ms);
const of = <T extends SimToMain['type']>(type: T) => out.filter((m): m is Extract<SimToMain, { type: T }> => m.type === type); // prettier-ignore
const last = (): Snapshot => {
  const s = of('snapshot').at(-1)?.snapshot;
  if (!s) throw new Error('no snapshot yet');
  return s;
};
const command = (cmd: 'START' | 'RESET' | 'ESTOP') => send({ type: 'command', command: { v: PROTOCOL_VERSION, kind: 'command', seq: 0, cmd } }); // prettier-ignore

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout', 'performance'] });
  out = [];
  posts = 0;
  scope = {
    postMessage: (m) => {
      posts++;
      if (m.type === 'batch') out.push(...m.messages);
      else out.push(m);
    },
    onmessage: null,
  };
  port = { postMessage: vi.fn(), onmessage: null };
  vi.stubGlobal('self', scope);
  vi.resetModules();
  await import('../../../src/sim/worker.ts');
  send({ type: 'connect', port: port as unknown as MessagePort });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sim worker (§10.2)', () => {
  it('batches its output: at most one post per snapshot (≤ 60 per second), pong straight away (P7.2)', () => {
    command('START');
    send({ type: 'raw', on: true });
    send({ type: 'speed', x: 10 });
    send({ type: 'play' });
    posts = 0;
    out = [];
    wall(1000);
    const snapshots = of('snapshot').length;
    expect(snapshots).toBeGreaterThanOrEqual(45); // 4 ms ticks: the 16.7 ms minimum gap lands on 20 ms
    expect(snapshots).toBeLessThanOrEqual(61);
    expect(out.length).toBeGreaterThan(posts * 2); // packets, events, logs and raw ride along with the snapshots
    expect(posts).toBeLessThanOrEqual(snapshots);
    const before = posts;
    send({ type: 'ping', id: 1 });
    expect(posts).toBe(before + 1);
    expect(out.at(-1)).toEqual({ type: 'pong', id: 1 });
  });

  it('boots with an OFF snapshot at t = 0 and answers ping', () => {
    wall(20);
    expect(last()).toMatchObject({ t_s: 0, state: 'OFF', lagging: false });
    send({ type: 'ping', id: 7 });
    expect(of('pong')).toEqual([{ type: 'pong', id: 7 }]);
  });

  it('paces the plant against the wall clock: 1 s wall at 1× and 4×, nothing while paused', () => {
    send({ type: 'play' });
    wall(1000);
    expect(last().t_s).toBeCloseTo(1, 1);
    send({ type: 'speed', x: 4 });
    wall(1000);
    expect(last().t_s).toBeCloseTo(5, 1);
    send({ type: 'pause' });
    const t = last().t_s;
    wall(1000);
    expect(last().t_s).toBe(t);
  });

  it('caps a long stall at 0.2 s of sim time per tick and reports lagging', () => {
    send({ type: 'play' });
    send({ type: 'speed', x: 10 });
    vi.setSystemTime(Date.now()); // keep Date in step; performance.now jumps below
    vi.advanceTimersByTime(4);
    const before = last().t_s;
    // one tick after a 2 s wall stall would owe 20 s of sim time
    vi.spyOn(performance, 'now').mockReturnValueOnce(performance.now() + 2000);
    vi.advanceTimersByTime(4);
    // 20 s were owed; the tick ran at most 0.2 s (the earlier snapshot may be up to 60 Hz stale, i.e. a few ticks)
    expect(last().t_s - before).toBeLessThan(0.5);
    expect(of('snapshot').some((m) => m.snapshot.lagging)).toBe(true);
  });

  it('START runs the real firmware: packets go to the RCF port and to main; verdicts come back as verdictIn', () => {
    command('START');
    send({ type: 'play' });
    send({ type: 'speed', x: 10 });
    wall(1500);
    expect(last().state).toBe('NORMAL');
    const packets = of('packet').map((m) => m.packet);
    expect(packets.length).toBeGreaterThan(10);
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'packet', packet: packets[0] });
    const p = packets.at(-1) as Packet;
    const verdict: Verdict = { v: PROTOCOL_VERSION, kind: 'verdict', seq_ref: p.seq, score: 0.1, threshold: 0.5, alert: false, clear: true, dominant: 'cf', z: null, model: 'READY' }; // prettier-ignore
    port.onmessage?.({ data: { type: 'verdict', verdict } });
    wall(20); // it rides along with the next snapshot's batch
    expect(of('verdictIn').at(-1)?.verdict).toEqual(verdict);
    port.onmessage?.({ data: { type: 'other' } }); // anything else on the channel is ignored
    const events = of('event').map((m) => m.event.type);
    expect(events).toEqual(expect.arrayContaining(['START', 'CALIBRATED', 'RELAY_CLOSED', 'NORMAL']));
    expect(of('log').some((m) => m.line.includes('INFO fsm: OFF -> CALIBRATING'))).toBe(true);
  });

  it('faults, clearFaults, params and init reach the plant and firmware', () => {
    send({ type: 'play' });
    send({ type: 'fault', key: 'friction', value: 0.4, ramp_s: 0 });
    send({ type: 'params', nCritical: 7, iMax_A: 0.35, tMax_C: 50 });
    wall(50);
    expect(last().faults.friction).toBe(0.4);
    expect(last().nCritical).toBe(7);
    send({ type: 'clearFaults' });
    wall(50);
    expect(last().faults.friction).toBe(0);
    send({ type: 'init', config: CONFIG, seed: CONFIG.seed, warmStart: false });
    expect(last()).toMatchObject({ t_s: 0, nCritical: CONFIG.firmware.nCritical });
    expect(last().tMotor_C).toBeCloseTo(CONFIG.thermal.ambient_C, 6);
    send({ type: 'reset' });
    expect(last().t_s).toBe(0);
  });

  it('streams the raw 1 kHz MPU samples while raw is on', () => {
    send({ type: 'raw', on: true });
    send({ type: 'play' });
    wall(200);
    const raw = of('raw');
    expect(raw.length).toBeGreaterThan(0);
    const n = raw.reduce((s, m) => s + m.ax.length, 0);
    expect(n).toBeGreaterThan(150);
    expect(raw[0]?.ay).toBeInstanceOf(Float32Array);
    send({ type: 'raw', on: false });
    const before = of('raw').length;
    wall(200);
    expect(of('raw').length).toBe(before);
  });

  it('plays a §12 script from the current sim time, with steps after CRITICAL, and pauses at its end', () => {
    send({ type: 'scenario', id: 'S0' });
    expect(of('log').at(-1)?.line).toBe('WARN sim: unknown scenario S0');
    send({ type: 'scenario', id: 'S8' });
    expect(of('scenario')).toEqual([{ type: 'scenario', id: 'S8', done: false }]);
    // Stand-in RCF: every packet gets an alert verdict once the imbalance is on, so the RCF trips.
    port.postMessage.mockImplementation((m: { packet: Packet }) => {
      const alert = m.packet.ts_ms > 61_000 && m.packet.state !== 'CRITICAL';
      const verdict: Verdict = { v: PROTOCOL_VERSION, kind: 'verdict', seq_ref: m.packet.seq, score: alert ? 0.9 : 0.1, threshold: 0.5, alert, clear: !alert, dominant: 'a_rms_g', z: null, model: 'READY' }; // prettier-ignore
      port.onmessage?.({ data: { type: 'verdict', verdict } });
    });
    send({ type: 'speed', x: 10 });
    send({ type: 'play' });
    for (let k = 0; k < 40 && !of('scenario').some((m) => m.done); k++) wall(1000);
    expect(of('scenario').at(-1)).toEqual({ type: 'scenario', id: 'S8', done: true });
    const types = of('event').map((m) => m.event);
    const crit = types.find((e) => e.type === 'CRITICAL')?.t_s ?? NaN;
    expect(types.find((e) => e.type === 'REFUSED')?.t_s).toBeCloseTo(crit + 1, 2);
    expect(types.find((e) => e.type === 'RESET')?.t_s).toBeCloseTo(crit + 20, 2);
    expect(last().t_s).toBeCloseTo(crit + 45, 1);
    // relay events reach main in sim-time order with the firmware's
    const open = types.find((e) => e.type === 'RELAY_OPEN')?.t_s ?? NaN;
    expect(types.findIndex((e) => e.type === 'CRITICAL')).toBeLessThan(types.findIndex((e) => e.type === 'RELAY_OPEN'));
    expect(open - crit).toBeLessThanOrEqual(0.02);
    const t = last().t_s;
    wall(1000);
    expect(last().t_s).toBe(t); // paused at the end
  });
});
