// M7 console text and exports (spec §8.2): one line per uplink packet and verdict, the CSV that joins each packet
// with its verdict by seq, and the session JSON. Pure formatting.
import { Packet, type Verdict } from '../shared/protocol.ts';
import type { ConsoleEntry } from '../store/slices/console.ts';

const num = (x: number | null, digits: number) => (x === null ? '—' : x.toFixed(digits));

/** `↑ #1042 NORMAL a=0.121g cf=2.50 I=0.181A T=34.06°C dT=0.00/min rpm=3810` */
export function packetLine(p: Packet): string {
  return `↑ #${p.seq} ${p.state} a=${p.a_rms_g.toFixed(3)}g cf=${p.cf.toFixed(2)} I=${p.i_rms_A.toFixed(3)}A T=${num(p.t_C, 2)}°C dT=${num(p.dtdt_C_per_min, 2)}/min rpm=${Math.round(p.rpm)}`; // prettier-ignore
}

/** `↓ #1042 score=0.21/0.50 clear dom=cf` — the word is ALERT, clear, hold (neither) or unscored. */
export function verdictLine(v: Verdict): string {
  const word = v.score === null ? 'unscored' : v.alert ? 'ALERT' : v.clear ? 'clear' : 'hold';
  return `↓ #${v.seq_ref} score=${num(v.score, 2)}/${v.threshold.toFixed(2)} ${word} dom=${v.dominant ?? '—'}`;
}

const VERDICT_COLUMNS = ['score', 'threshold', 'alert', 'clear', 'dominant'] as const;
/** CSV header: every packet field in protocol order, then the verdict columns. */
export const CSV_COLUMNS: readonly string[] = [...Object.keys(Packet.shape), ...VERDICT_COLUMNS];

const cell = (x: unknown) => (x === null || x === undefined ? '' : String(x));

/** CSV of the console's packets, one row each, joined with the verdict for the same seq (empty if none). */
export function buildCsv(entries: readonly ConsoleEntry[]): string {
  const verdicts = new Map<number, Verdict>();
  for (const e of entries) if (e.kind === 'verdict') verdicts.set((e.json as Verdict).seq_ref, e.json as Verdict);
  const packetKeys = Object.keys(Packet.shape) as (keyof Packet)[];
  const rows = entries
    .filter((e) => e.kind === 'packet')
    .map((e) => {
      const p = e.json as Packet;
      const v = verdicts.get(p.seq);
      return [...packetKeys.map((k) => cell(p[k])), ...VERDICT_COLUMNS.map((k) => cell(v?.[k]))].join(',');
    });
  return `${[CSV_COLUMNS.join(','), ...rows].join('\n')}\n`;
}

/** The whole console as JSON: packets, verdicts, commands (their messages) and log lines (text). */
export function buildSessionJson(entries: readonly ConsoleEntry[]): string {
  const of = (kind: ConsoleEntry['kind']) => entries.filter((e) => e.kind === kind).map((e) => e.json);
  return JSON.stringify({
    packets: of('packet'),
    verdicts: of('verdict'),
    commands: of('command'),
    logs: entries.filter((e) => e.kind === 'log').map((e) => e.text),
  });
}
