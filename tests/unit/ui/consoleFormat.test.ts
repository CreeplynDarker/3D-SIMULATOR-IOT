import { describe, expect, it } from 'vitest';
import { type Packet, PROTOCOL_VERSION, type Verdict } from '../../../src/shared/protocol.ts';
import type { ConsoleEntry } from '../../../src/store/slices/console.ts';
import { buildCsv, buildSessionJson, CSV_COLUMNS, packetLine, verdictLine } from '../../../src/ui/consoleFormat.ts';

const packet = (seq: number, extra: Partial<Packet> = {}): Packet => ({
  v: PROTOCOL_VERSION,
  kind: 'packet',
  seq,
  ts_ms: (seq + 1) * 1000,
  win_ms: 1000,
  a_rms_g: 0.121,
  cf: 2.5012,
  i_rms_A: 0.1813,
  t_C: 34.0625,
  dtdt_C_per_min: 0,
  rpm: 3810,
  state: 'NORMAL',
  relay_ch2: 'ON',
  link_lost: false,
  sensor_fault: false,
  warn_reason: null,
  trip_reason: null,
  ...extra,
});
const verdict = (seq: number, score: number | null, extra: Partial<Verdict> = {}): Verdict => ({
  v: PROTOCOL_VERSION,
  kind: 'verdict',
  seq_ref: seq,
  score,
  threshold: 0.5,
  alert: score !== null && score > 0.5,
  clear: score !== null && score < 0.4,
  dominant: score === null ? null : 'cf',
  z: null,
  model: 'READY',
  ...extra,
});

describe('M7 console lines (§8.2)', () => {
  it('uplink packets read like the spec example', () => {
    expect(packetLine(packet(1042))).toBe('↑ #1042 NORMAL a=0.121g cf=2.50 I=0.181A T=34.06°C dT=0.00/min rpm=3810');
    expect(packetLine(packet(7, { t_C: null, dtdt_C_per_min: null, state: 'STARTING' }))).toBe('↑ #7 STARTING a=0.121g cf=2.50 I=0.181A T=—°C dT=—/min rpm=3810'); // prettier-ignore
  });

  it('verdicts read score/threshold, then alert, clear, hold or unscored, and the dominant variable', () => {
    expect(verdictLine(verdict(1042, 0.2149))).toBe('↓ #1042 score=0.21/0.50 clear dom=cf');
    expect(verdictLine(verdict(5, 0.81, { dominant: 'a_rms_g' }))).toBe('↓ #5 score=0.81/0.50 ALERT dom=a_rms_g');
    expect(verdictLine(verdict(6, 0.45))).toBe('↓ #6 score=0.45/0.50 hold dom=cf');
    expect(verdictLine(verdict(7, null))).toBe('↓ #7 score=—/0.50 unscored dom=—');
  });
});

describe('M7 exports (§8.2)', () => {
  const entries: ConsoleEntry[] = [
    { kind: 'packet', text: '', json: packet(0, { state: 'STARTING', t_C: null }) },
    { kind: 'verdict', text: '', json: verdict(0, null) },
    { kind: 'log', text: '[t=000001.000] INFO fsm: x' },
    { kind: 'packet', text: '', json: packet(1) },
    { kind: 'command', text: '', json: { v: 1, kind: 'command', seq: 0, cmd: 'START' } },
    { kind: 'packet', text: '', json: packet(2) },
    { kind: 'verdict', text: '', json: verdict(2, 0.62, { dominant: 'a_rms_g' }) },
  ];

  it('CSV: every packet field, then score, threshold, alert, clear, dominant joined by seq', () => {
    expect(CSV_COLUMNS).toEqual(['v', 'kind', 'seq', 'ts_ms', 'win_ms', 'a_rms_g', 'cf', 'i_rms_A', 't_C', 'dtdt_C_per_min', 'rpm', 'state', 'relay_ch2', 'link_lost', 'sensor_fault', 'warn_reason', 'trip_reason', 'score', 'threshold', 'alert', 'clear', 'dominant']); // prettier-ignore
    const lines = buildCsv(entries).trimEnd().split('\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(
      '1,packet,0,1000,1000,0.121,2.5012,0.1813,,0,3810,STARTING,ON,false,false,,,,0.5,false,false,',
    );
    expect(lines[2]?.endsWith(',NORMAL,ON,false,false,,,,,,,')).toBe(true); // no verdict for #1
    expect(lines[3]?.endsWith(',0.62,0.5,true,false,a_rms_g')).toBe(true);
  });

  it('session JSON holds packets, verdicts, commands and logs', () => {
    const s = JSON.parse(buildSessionJson(entries)) as Record<string, unknown[]>;
    expect(s['packets']).toHaveLength(3);
    expect(s['verdicts']).toHaveLength(2);
    expect(s['commands']).toHaveLength(1);
    expect(s['logs']).toEqual(['[t=000001.000] INFO fsm: x']);
  });
});
