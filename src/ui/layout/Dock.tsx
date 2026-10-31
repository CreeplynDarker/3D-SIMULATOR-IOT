// Bottom dock (spec §8.1): tabs M6 / M7 / M8 / M10 and a drag handle that resizes it within 160–480 px.
import { type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react';
import { appStore, useAppStore } from '../../store/index.ts';
import type { DockTab } from '../../store/slices/ui.ts';

export const DOCK_TABS: { id: DockTab; label: string }[] = [
  { id: 'charts', label: 'Charts' },
  { id: 'console', label: 'Console' },
  { id: 'code', label: 'Code' },
  { id: 'testlog', label: 'Test log' },
];

/** Drag handle on the dock's top edge: dragging up makes the dock taller. */
function ResizeHandle() {
  const start = useRef<{ y: number; h: number } | null>(null);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, h: appStore.getState().ui.dockHeight_px };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (start.current) appStore.getState().ui.setDockHeight(start.current.h + start.current.y - e.clientY);
  };
  const up = () => (start.current = null);
  return (
    <div
      data-testid="dock-resize"
      role="separator"
      aria-orientation="horizontal"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      className="h-1.5 cursor-row-resize bg-slate-300 hover:bg-sky-500 dark:bg-slate-700"
    />
  );
}

/** The dock: its height is a user-dragged value, applied as a CSS variable (D-045). */
export function Dock({ panels }: { panels: Record<DockTab, ReactNode> }) {
  const tab = useAppStore((s) => s.ui.dockTab);
  const height = useAppStore((s) => s.ui.dockHeight_px);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.style.setProperty('--dock-h', `${height}px`), [height]);
  return (
    <section
      ref={ref}
      data-testid="region-dock"
      className="flex h-[var(--dock-h)] flex-col border-t border-slate-300 bg-slate-50 xl:col-span-3 dark:border-slate-700 dark:bg-slate-900"
    >
      <ResizeHandle />
      <div role="tablist" className="flex gap-1 border-b border-slate-300 px-2 pt-1 dark:border-slate-700">
        {DOCK_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-testid={`dock-tab-${t.id}`}
            aria-selected={tab === t.id}
            onClick={() => appStore.getState().ui.setDockTab(t.id)}
            className="rounded-t px-3 py-1 text-xs text-slate-600 aria-selected:bg-white aria-selected:font-semibold aria-selected:text-slate-900 dark:text-slate-300 dark:aria-selected:bg-slate-800 dark:aria-selected:text-white"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto">
        {panels[tab]}
      </div>
    </section>
  );
}
