// The RCF worker (spec §9, §10.2) run in Node with a stand-in worker scope and a stand-in "Wi-Fi" port.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MainToRcf, RcfToMain } from '../../../src/shared/messages.ts';
import { type Packet, PROTOCOL_VERSION, Verdict } from '../../../src/shared/protocol.ts';

const MODEL = readFileSync(join(import.meta.dirname, '../../../public/models/default-model.json'), 'utf8');
let out: RcfToMain[] = [];
let scope: { postMessage: (m: RcfToMain) => void; onmessage: ((e: { data: MainToRcf }) => void) | null };
let port: { postMessage: ReturnType<typeof vi.fn>; onmessage: ((e: { data: unknown }) => void) | null };
const send = (m: MainToRcf) => scope.onmessage?.({ data: m });
const status = () => out.filter((m) => m.type === 'modelStatus').at(-1);

const packet = (seq: number, extra: Partial<Packet> = {}): Packet => ({
  v: PROTOCOL_VERSION, kind: 'packet', seq, ts_ms: (seq + 1) * 1000, win_ms: 1000, a_rms_g: 0.1205, cf: 2.5,
  i_rms_A: 0.181, t_C: 33.9, dtdt_C_per_min: -0.1, rpm: 3800, state: 'NORMAL', relay_ch2: 'ON', link_lost: false,
  sensor_fault: false, warn_reason: null, trip_reason: null, ...extra,
}); // prettier-ignore
const deliver = (p: unknown) => port.onmessage?.({ data: { type: 'packet', packet: p } });

beforeEach(async () => {
  out = [];
  scope = { postMessage: (m) => void out.push(m), onmessage: null };
  port = { postMessage: vi.fn(), onmessage: null };
  vi.stubGlobal('self', scope);
  vi.resetModules();
  await import('../../../src/rcf/worker.ts');
  send({ type: 'connect', port: port as unknown as MessagePort });
});
afterEach(() => vi.unstubAllGlobals());

describe('RCF worker (§9.3, §10.2)', () => {
  it('boots UNTRAINED and answers ping', () => {
    expect(status()).toEqual({ type: 'modelStatus', status: 'UNTRAINED', progress: 0 });
    send({ type: 'ping', id: 3 });
    expect(out.at(-1)).toEqual({ type: 'pong', id: 3 });
  });

  it('loads a model (READY) and answers each packet on the channel and to main, scored in NORMAL', () => {
    send({ type: 'loadModel', json: MODEL });
    expect(status()).toEqual({ type: 'modelStatus', status: 'READY', progress: 1 });
    deliver(packet(12));
    const toSim = port.postMessage.mock.calls.at(-1)?.[0] as { type: string; verdict: unknown };
    expect(toSim.type).toBe('verdict');
    const v = Verdict.parse(toSim.verdict);
    expect(v).toMatchObject({ seq_ref: 12, model: 'READY' });
    expect(v.score).not.toBeNull();
    expect(out.at(-1)).toEqual({ type: 'verdict', verdict: toSim.verdict });
    deliver({ kind: 'packet', seq: -1 }); // malformed packets are dropped silently
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed model JSON with a reason; setThreshold reaches the verdicts', () => {
    send({ type: 'loadModel', json: '{"nope":1}' });
    expect(status()).toMatchObject({ status: 'UNTRAINED', reason: expect.stringMatching(/^model rejected/) });
    send({ type: 'loadModel', json: MODEL });
    send({ type: 'setThreshold', x: 0.42 });
    deliver(packet(1));
    expect((out.at(-1) as { verdict: Verdict }).verdict.threshold).toBe(0.42);
  });

  it('train reports TRAINING with progress per collected window, and posts the status changes to main', () => {
    send({ type: 'train' });
    expect(status()).toEqual({ type: 'modelStatus', status: 'TRAINING', progress: 0 });
    deliver(packet(1));
    expect(status()).toMatchObject({ status: 'TRAINING', progress: 1 / 180 });
    deliver(packet(2, { state: 'WARNING' }));
    expect(status()).toMatchObject({ status: 'UNTRAINED', reason: 'training aborted: state left NORMAL (WARNING)' });
  });
});
