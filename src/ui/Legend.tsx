// M12 legend and help (spec §8.2): wire colour key, state colours, shortcuts and the §14 glossary, as a modal.
import { type ReactNode, useEffect } from 'react';
import type { State } from '../shared/protocol.ts';
import { appStore, useAppStore } from '../store/index.ts';
import { actions } from './actions.ts';
import { STATE_TONE, TONE_CLASS } from './format.ts';
import { Button } from './kit.tsx';
import { GLOSSARY, SHORTCUTS, shortcutFor, WIRE_KEY, wireHex } from './legend.ts';

const STATES = Object.keys(STATE_TONE) as State[];

/** Global keyboard shortcuts (§8.2); ignored while typing in a form field. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = shortcutFor(e.key);
      if (!s) return;
      const st = appStore.getState();
      if (s.kind === 'togglePlay') {
        e.preventDefault();
        actions.togglePlay();
      } else if (s.kind === 'start') actions.command('START');
      else if (s.kind === 'estop') actions.command('ESTOP');
      else if (s.kind === 'reset') actions.requestReset();
      else if (s.kind === 'help') st.ui.setLegendOpen(true);
      else if (s.kind === 'close') {
        st.ui.setLegendOpen(false);
        st.ui.setResetDialogOpen(false);
      } else if (s.kind === 'camera') st.ui.setCamera(s.preset);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-3">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

/** `legend-modal`. */
export function Legend() {
  const open = useAppStore((s) => s.ui.legendOpen);
  if (!open) return null;
  const close = () => appStore.getState().ui.setLegendOpen(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={close}>
      <div
        data-testid="legend-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legend-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-[720px] max-w-[95vw] overflow-y-auto rounded bg-white p-4 text-sm shadow-xl dark:bg-slate-800"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="legend-title" className="text-base font-semibold">
            Legend and help
          </h2>
          <Button testId="btn-legend-close" onClick={close}>
            Close
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Section title="Wire colours">
            {WIRE_KEY.map((w) => (
              <div key={w.color} data-testid="legend-wire" className="flex items-center gap-2 text-xs">
                <svg width="28" height="6" aria-hidden="true">
                  <rect width="28" height="6" rx="3" fill={wireHex(w.color)} stroke="#64748b" strokeWidth="0.5" />
                </svg>
                {w.meaning}
              </div>
            ))}
          </Section>
          <div>
            <Section title="State colours">
              <div className="flex flex-wrap gap-1">
                {STATES.map((s) => (
                  <span
                    key={s}
                    data-testid="legend-state"
                    className={`rounded px-2 py-0.5 text-xs ${TONE_CLASS[STATE_TONE[s]]}`}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </Section>
            <Section title="Keyboard">
              {SHORTCUTS.map((k) => (
                <div key={k.keys} className="text-xs">
                  <kbd className="rounded border border-slate-400 px-1 font-mono">{k.keys}</kbd> {k.action}
                </div>
              ))}
            </Section>
          </div>
        </div>
        <Section title="Glossary">
          <dl className="text-xs">
            {GLOSSARY.map((g) => (
              <div key={g.term} className="py-0.5">
                <dt className="inline font-semibold">{g.term}:</dt> <dd className="inline">{g.text}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>
    </div>
  );
}
