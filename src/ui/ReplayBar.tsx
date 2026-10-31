// Replay (P8.3) over the viewport: pick a session file (a bridge session or an M7 JSON export) and see how far it
// has played. Play/pause and the speed are the top bar's.
import { useAppStore } from '../store/index.ts';
import type { ReplayInfo } from '../store/slices/sim.ts';
import { actions } from './actions.ts';

/** One line: file, packets played of the total, done, skipped lines, or why the file was refused. */
function statusText(r: ReplayInfo): string {
  if (r.error) return `${r.name}: ${r.error}`;
  const skipped = r.skipped ? ` · ${r.skipped} lines skipped` : '';
  return `${r.name} · ${r.sent}/${r.total} packets${r.done ? ' · done' : ''}${skipped}`;
}

export function ReplayBar() {
  const source = useAppStore((s) => s.sim.source);
  const replay = useAppStore((s) => s.sim.replay);
  if (source !== 'replay') return null;
  return (
    <div className="absolute left-1/2 top-3 flex max-w-[80%] -translate-x-1/2 items-center gap-2 rounded bg-slate-800/90 px-3 py-1.5 text-xs text-white shadow">
      <label className="flex items-center gap-1">
        Session file
        <input
          data-testid="inp-replay-file"
          type="file"
          accept=".jsonl,.json,application/json"
          className="max-w-56 text-xs file:mr-2 file:rounded file:border-0 file:bg-sky-600 file:px-2 file:py-0.5 file:text-white"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void file.text().then((text) => actions.loadReplay(text, file.name));
            e.target.value = '';
          }}
        />
      </label>
      <span data-testid="replay-status" data-done={replay?.done ?? false} role="status">
        {replay ? statusText(replay) : 'Pick a bridge session (.jsonl) or an M7 export (.json).'}
      </span>
    </div>
  );
}
