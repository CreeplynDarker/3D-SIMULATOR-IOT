// M7 data console (spec §8.2): uplink packets, verdicts, commands and log lines, filterable; click a line to see its
// JSON. Pause freezes the view (lines keep arriving), copy puts the visible lines on the clipboard, and the exports
// save CSV (packets joined with verdicts by seq) or the whole session as JSON.
import { useEffect, useMemo, useRef, useState } from 'react';
import { appStore, useAppStore } from '../store/index.ts';
import type { ConsoleEntry, ConsoleKind } from '../store/slices/console.ts';
import { actions } from './actions.ts';
import { buildCsv, buildSessionJson } from './consoleFormat.ts';
import { download } from './download.ts';
import { Button, ToggleButton } from './kit.tsx';

/** Lines kept on screen; the ring holds up to `ui.consoleMaxLines` for the exports. */
const SHOWN = 400;
const FILTERS: { kind: ConsoleKind; id: string; label: string }[] = [
  { kind: 'packet', id: 'flt-packets', label: '↑ packets' },
  { kind: 'verdict', id: 'flt-verdicts', label: '↓ verdicts' },
  { kind: 'command', id: 'flt-commands', label: '→ commands' },
  { kind: 'log', id: 'flt-logs', label: 'logs' },
];
const TONE: Record<ConsoleKind, string> = {
  packet: 'text-sky-700 dark:text-sky-300',
  verdict: 'text-emerald-700 dark:text-emerald-300',
  command: 'text-violet-700 dark:text-violet-300',
  log: 'text-slate-700 dark:text-slate-300',
};

/** The lines that pass the filters, newest last; frozen while paused. */
function useVisibleLines(): ConsoleEntry[] {
  const rev = useAppStore((s) => s.console.rev);
  const paused = useAppStore((s) => s.console.paused);
  const filters = useAppStore((s) => s.console.filters);
  const frozen = useRef<ConsoleEntry[]>([]);
  return useMemo(() => {
    if (paused) return frozen.current;
    void rev;
    const all = appStore.getState().console.lines.toArray();
    frozen.current = all.filter((e) => filters[e.kind]).slice(-SHOWN);
    return frozen.current;
  }, [rev, paused, filters]);
}

/** Filters, pause, copy, exports and the raw MPU switch. */
function Toolbar({ visible }: { visible: ConsoleEntry[] }) {
  const filters = useAppStore((s) => s.console.filters);
  const paused = useAppStore((s) => s.console.paused);
  const raw = useAppStore((s) => s.sim.raw);
  const c = appStore.getState().console;
  const entries = () => appStore.getState().console.lines.toArray();
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-300 px-2 py-1 dark:border-slate-700">
      {FILTERS.map((f) => (
        <ToggleButton
          key={f.id}
          testId={f.id}
          label={f.label}
          on={filters[f.kind]}
          onChange={(on) => c.setFilter(f.kind, on)}
        />
      ))}
      <span className="mx-1 h-4 border-l border-slate-300 dark:border-slate-700" />
      <ToggleButton testId="btn-console-pause" label={paused ? 'Paused' : 'Pause'} on={paused} onChange={c.setPaused} />
      <Button
        testId="btn-console-copy"
        onClick={() => void navigator.clipboard?.writeText(visible.map((e) => e.text).join('\n'))}
      >
        Copy
      </Button>
      <Button testId="btn-export-csv" onClick={() => download('pdm-session.csv', 'text/csv', buildCsv(entries()))}>
        Export CSV
      </Button>
      <Button
        testId="btn-export-json"
        onClick={() => download('pdm-session.json', 'application/json', buildSessionJson(entries()))}
      >
        Export JSON
      </Button>
      <span className="mx-1 h-4 border-l border-slate-300 dark:border-slate-700" />
      <ToggleButton testId="tgl-raw-mpu" label="Raw MPU 1 kHz" on={raw.on} onChange={actions.setRawMpu} />
      {raw.on && (
        <span data-testid="raw-mpu" className="font-mono text-[11px] text-slate-500">
          {raw.samples} samples
          {raw.last && ` · x=${raw.last[0].toFixed(3)} y=${raw.last[1].toFixed(3)} z=${raw.last[2].toFixed(3)} g`}
        </span>
      )}
    </div>
  );
}

/** The M7 tab. */
export function Console() {
  const visible = useVisibleLines();
  const [open, setOpen] = useState<Set<ConsoleEntry>>(new Set());
  const paused = useAppStore((s) => s.console.paused);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el && !paused) el.scrollTop = el.scrollHeight;
  }, [visible, paused]);
  const toggle = (e: ConsoleEntry) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(e)) next.add(e);
      return next;
    });
  return (
    <div className="flex h-full flex-col">
      <Toolbar visible={visible} />
      <div
        ref={scroller}
        data-testid="console"
        className="min-h-0 flex-1 overflow-y-auto px-2 py-1 font-mono text-[11px] leading-4"
      >
        {visible.map((e, i) => (
          <div key={i} data-testid="console-line" data-kind={e.kind}>
            <button
              type="button"
              onClick={() => e.json !== undefined && toggle(e)}
              className={`w-full text-left hover:bg-slate-200/60 dark:hover:bg-slate-800 ${TONE[e.kind]}`}
            >
              {e.text}
            </button>
            {open.has(e) && (
              <pre data-testid="console-json" className="ml-4 whitespace-pre-wrap text-slate-500">
                {JSON.stringify(e.json, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
