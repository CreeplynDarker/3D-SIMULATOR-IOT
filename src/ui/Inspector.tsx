// M9 inspector (spec §8.2): the selected component's name, photo crop, key specs, live pins and wires.
import { type ComponentId, COMPONENTS } from '../shared/components.ts';
import { WIRE_COLORS } from '../shared/wiring.ts';
import { useAppStore } from '../store/index.ts';
import { inspectorFor } from './inspectorData.ts';
import { Panel } from './kit.tsx';

/** Details of the selected part; live values re-render with each snapshot. */
function Details({ id }: { id: ComponentId }) {
  const snap = useAppStore((s) => s.sim.snapshot);
  const status = useAppStore((s) => s.model.status);
  const score = useAppStore((s) => s.model.lastVerdict?.score ?? null);
  if (!snap) return null;
  const info = inspectorFor(id, snap, { status, score });
  return (
    <div className="space-y-2 text-xs">
      <h3 className="text-sm font-semibold">{info.name}</h3>
      {info.photo && <img src={info.photo} alt={info.name} className="max-h-28 w-full rounded object-contain" />}
      <ul className="list-disc pl-4 text-slate-600 dark:text-slate-300">
        {info.specs.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <div>
        <h4 className="font-semibold">Pins (live)</h4>
        {info.pins.map((p, i) => (
          <div key={i} data-testid="inspector-pin" className="font-mono tabular-nums">
            {p.text}
          </div>
        ))}
      </div>
      {info.wires.length > 0 && (
        <div>
          <h4 className="font-semibold">Wires</h4>
          {info.wires.map((w) => (
            <div key={w.id} className="flex items-center gap-1 font-mono">
              <svg width="10" height="10" aria-hidden="true">
                <rect width="10" height="10" fill={WIRE_COLORS[w.color]} stroke="#64748b" />
              </svg>
              {w.id} {w.from} → {w.to} ({w.net})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The M9 panel under M3 in the right column. */
export function Inspector() {
  const selected = useAppStore((s) => s.ui.selectedId);
  const id = COMPONENTS.find((c) => c.id === selected)?.id ?? null;
  return (
    <Panel title="Inspector (M9)">
      <div data-testid="inspector">
        {id ? (
          <Details id={id} />
        ) : (
          <p className="text-xs text-slate-500">Click a part in the 3D view to inspect it.</p>
        )}
      </div>
    </Panel>
  );
}
