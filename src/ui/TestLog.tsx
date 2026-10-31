// M10 test log (spec §8.2): one row per run with its condition, start, duration, whether it alerted, the time to
// the first alert, the CRITICAL → relay-open delay, whether the operator reset it, and notes.
import { useAppStore } from '../store/index.ts';
import type { TestRun } from '../store/slices/testlog.ts';
import { actions } from './actions.ts';
import { download } from './download.ts';
import { Button } from './kit.tsx';
import { testlogCsv } from './testlog.ts';

const HEAD = ['Scenario / condition', 'Start (s)', 'Duration (s)', 'Alerted', 'First alert (s)', 'CRITICAL → relay open (ms)', 'Reset by operator', 'Notes']; // prettier-ignore
const dash = (x: number | null, digits: number) => (x === null ? '—' : x.toFixed(digits));

function Row({ r, open }: { r: TestRun; open: boolean }) {
  return (
    <tr data-testid="testlog-row" className={open ? 'bg-sky-50 dark:bg-sky-950' : ''}>
      <td className="px-2">{r.scenario}</td>
      <td className="px-2 text-right tabular-nums">{r.start_s.toFixed(1)}</td>
      <td className="px-2 text-right tabular-nums">{open ? 'running' : dash(r.duration_s, 1)}</td>
      <td className="px-2 text-center">{r.alerted ? 'y' : 'n'}</td>
      <td className="px-2 text-right tabular-nums">{dash(r.firstAlert_s, 2)}</td>
      <td className="px-2 text-right tabular-nums">{dash(r.criticalToRelay_ms, 1)}</td>
      <td className="px-2 text-center">{r.resetByOperator ? 'y' : 'n'}</td>
      <td className="px-2">{r.notes}</td>
    </tr>
  );
}

/** The M10 tab. */
export function TestLog() {
  const runs = useAppStore((s) => s.testlog.runs);
  const active = useAppStore((s) => s.testlog.active);
  const notes = useAppStore((s) => s.testlog.runs.find((r) => r.id === (s.testlog.active ?? s.testlog.runs.at(-1)?.id))?.notes ?? ''); // prettier-ignore
  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex items-center gap-1.5 border-b border-slate-300 px-2 py-1 dark:border-slate-700">
        <Button testId="btn-run-start" tone="go" disabled={active !== null} onClick={actions.startRun}>
          Start run
        </Button>
        <Button testId="btn-run-stop" disabled={active === null} onClick={actions.stopRun}>
          Stop run
        </Button>
        <input
          data-testid="inp-run-notes"
          placeholder="Notes for the current or last run"
          value={notes}
          disabled={runs.length === 0}
          onChange={(e) => actions.setRunNotes(e.target.value)}
          className="w-72 rounded border border-slate-400 bg-white px-1 py-0.5 dark:border-slate-600 dark:bg-slate-800"
        />
        <Button
          testId="btn-testlog-export"
          disabled={runs.length === 0}
          onClick={() => download('pdm-testlog.csv', 'text/csv', testlogCsv(runs))}
        >
          Export CSV
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table data-testid="testlog-table" className="w-full border-collapse">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
            <tr>
              {HEAD.map((h) => (
                <th key={h} className="px-2 py-1 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <Row key={r.id} r={r} open={r.id === active} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
