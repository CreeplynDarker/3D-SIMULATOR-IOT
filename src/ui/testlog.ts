// M10 test log bookkeeping (spec §8.2): a run's condition text, what each event adds to the open run, and the CSV.
// It records times the events carry; nothing is computed from physics.
import type { FaultValues, SimEvent } from '../shared/messages.ts';
import type { TestRun, TestRunPatch } from '../store/slices/testlog.ts';

/** The scenario id, else "manual: " and the faults set (numeric ones with their value). */
export function conditionText(scenarioId: string | null, faults: FaultValues): string {
  if (scenarioId) return scenarioId;
  const on = Object.entries(faults)
    .filter(([, v]) => v !== 0 && v !== false)
    .map(([k, v]) => (v === true ? k : `${k}=${String(v)}`));
  return `manual: ${on.length > 0 ? on.join(', ') : 'no fault'}`;
}

/** What event `e` adds to `run`: the first ALERT, the first CRITICAL → RELAY_OPEN delay, an operator RESET. */
export function runPatch(run: TestRun, e: SimEvent): TestRunPatch {
  if (e.t_s < run.start_s) return {};
  if (e.type === 'ALERT' && !run.alerted) return { alerted: true, firstAlert_s: e.t_s - run.start_s };
  if (e.type === 'CRITICAL' && run.critical_s === null) return { critical_s: e.t_s };
  if (e.type === 'RELAY_OPEN' && run.critical_s !== null && run.criticalToRelay_ms === null) {
    return { criticalToRelay_ms: (e.t_s - run.critical_s) * 1000 };
  }
  if (e.type === 'RESET') return { resetByOperator: true };
  return {};
}

const quote = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const fixed = (x: number | null, digits: number) => (x === null ? '' : x.toFixed(digits));
const yn = (b: boolean) => (b ? 'y' : 'n');

/** The M10 table as CSV (times in s, the relay delay in ms). */
export function testlogCsv(runs: readonly TestRun[]): string {
  const header = 'scenario,start_s,duration_s,alerted,first_alert_s,critical_to_relay_ms,reset_by_operator,notes';
  const rows = runs.map(
    (r) =>
    [quote(r.scenario), fixed(r.start_s, 1), fixed(r.duration_s, 1), yn(r.alerted), fixed(r.firstAlert_s, 2), fixed(r.criticalToRelay_ms, 1), yn(r.resetByOperator), quote(r.notes)].join(','), // prettier-ignore
  );
  return `${[header, ...rows].join('\n')}\n`;
}
