// App layout (spec §8.1): top bar 48 px; left column 320 px (M4 over M5); centre viewport (M1); right column 340 px
// (M3 over M9); bottom dock. Below 1280 px (Tailwind `xl`) the side columns stack under the viewport.
import type { ReactNode } from 'react';
import { useAppStore } from '../../store/index.ts';
import type { DockTab } from '../../store/slices/ui.ts';
import { Dock } from './Dock.tsx';

export interface ShellSlots {
  topBar: ReactNode;
  left: ReactNode;
  viewport: ReactNode;
  right: ReactNode;
  dock: Record<DockTab, ReactNode>;
  overlays?: ReactNode;
}

/** The grid that places every module; the theme class lives here. */
export function AppShell(slots: ShellSlots) {
  const theme = useAppStore((s) => s.ui.theme);
  return (
    <div
      data-testid="app-shell"
      className={`${theme === 'dark' ? 'dark' : ''} grid min-h-screen grid-cols-1 bg-white text-slate-900 xl:h-screen xl:grid-cols-[320px_minmax(0,1fr)_340px] xl:grid-rows-[48px_minmax(0,1fr)_auto] dark:bg-slate-950 dark:text-slate-100`}
    >
      <header
        data-testid="region-topbar"
        className="flex h-12 items-center gap-2 border-b border-slate-300 px-3 xl:col-span-3 dark:border-slate-700"
      >
        {slots.topBar}
      </header>
      <main data-testid="region-viewport" className="relative h-[60vh] min-h-0 xl:col-start-2 xl:row-start-2 xl:h-auto">
        {slots.viewport}
      </main>
      <aside
        data-testid="region-left"
        className="min-h-0 overflow-y-auto border-slate-300 xl:col-start-1 xl:row-start-2 xl:border-r dark:border-slate-700"
      >
        {slots.left}
      </aside>
      <aside
        data-testid="region-right"
        className="min-h-0 overflow-y-auto border-slate-300 xl:col-start-3 xl:row-start-2 xl:border-l dark:border-slate-700"
      >
        {slots.right}
      </aside>
      <Dock panels={slots.dock} />
      {slots.overlays}
    </div>
  );
}
