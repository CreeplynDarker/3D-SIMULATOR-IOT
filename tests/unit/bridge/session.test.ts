import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dueCount, parseSession } from '../../../src/bridge/session.ts';
import { buildSessionJson } from '../../../src/ui/consoleFormat.ts';
import { type Packet, PROTOCOL_VERSION } from '../../../src/shared/protocol.ts';

const packet = (seq: number): Packet => ({
  v: PROTOCOL_VERSION, kind: 'packet', seq, ts_ms: (seq + 1) * 1000, win_ms: 1000, a_rms_g: 0.12, cf: 2.5,
  i_rms_A: 0.18, t_C: 34, dtdt_C_per_min: 0, rpm: 3800, state: 'NORMAL', relay_ch2: 'ON', link_lost: false,
  sensor_fault: false, warn_reason: null, trip_reason: null,
}); // prettier-ignore

describe('replay sessions (P8.3)', () => {
  it('reads a bridge session (JSON lines): the packets sent up, in time order; drops and other lines skipped', () => {
    const lines = [
      { t_ms: 0, dir: 'up', msg: packet(1) },
      { t_ms: 5, dir: 'down', msg: { kind: 'verdict' } },
      { t_ms: 9, dir: 'up', invalid: 'bad JSON', raw: 'x' },
      { t_ms: 10, dir: 'up', msg: packet(0) },
      { t_ms: 11, dir: 'up', msg: { ...packet(2), state: 'BROKEN' } },
    ];
    const s = parseSession(`${lines.map((l) => JSON.stringify(l)).join('\n')}\nnot json\n`);
    expect(s.packets.map((p) => p.seq)).toEqual([0, 1]);
    expect(s.skipped).toBe(2); // the invalid packet and the unparsable line; drops and verdicts are not packets
    expect(s.format).toBe('bridge');
  });

  it('reads the M7 JSON export', () => {
    const s = parseSession(JSON.stringify({ packets: [packet(0), packet(1), packet(2)], verdicts: [], commands: [], logs: [] })); // prettier-ignore
    expect(s).toMatchObject({ format: 'export', skipped: 0 });
    expect(s.packets).toHaveLength(3);
  });

  it('refuses a file with no packets', () => {
    expect(() => parseSession('')).toThrow(/no packets/);
    expect(() => parseSession('{"hello":1}')).toThrow(/no packets/);
  });

  it('dueCount: how many packets are due after a replay time from the first one (s)', () => {
    const ps = [packet(0), packet(1), packet(2), packet(3)];
    expect(dueCount(ps, 0)).toBe(1);
    expect(dueCount(ps, 1.5)).toBe(2);
    expect(dueCount(ps, 99)).toBe(4);
  });

  it('reads the S2 fixture (gen:fixtures) and its own M7 export the same way', () => {
    const text = readFileSync(join(import.meta.dirname, '../../fixtures/session_s2.jsonl'), 'utf8');
    const bridge = parseSession(text);
    expect(bridge).toMatchObject({ format: 'bridge', skipped: 0 });
    expect(bridge.packets).toHaveLength(120);
    expect(bridge.packets.map((p) => p.state)).toContain('CRITICAL');
    const entries = bridge.packets.map((p) => ({ kind: 'packet' as const, text: '', json: p }));
    expect(parseSession(buildSessionJson(entries)).packets).toEqual(bridge.packets);
  });
});
