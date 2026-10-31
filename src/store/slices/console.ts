import type { StateCreator } from 'zustand/vanilla';
import { CONFIG } from '../../shared/config.ts';
import type { AppState } from '../index.ts';
import { createRing, type Ring } from '../ring.ts';

export const CONSOLE_CAPACITY = CONFIG.ui.consoleMaxLines;

/** One M7 console line; `json` is the message it came from, shown when the line is expanded. */
export interface ConsoleEntry {
  kind: 'packet' | 'verdict' | 'command' | 'log';
  text: string;
  json?: unknown;
}

export type ConsoleKind = ConsoleEntry['kind'];

export interface ConsoleSlice {
  console: {
    lines: Ring<ConsoleEntry>;
    paused: boolean;
    /** Which kinds of line M7 shows (`flt-*`). */
    filters: Record<ConsoleKind, boolean>;
    /** Bumped on every change; subscribe to it to redraw. */
    rev: number;
    append(entry: ConsoleEntry): void;
    setPaused(paused: boolean): void;
    setFilter(kind: ConsoleKind, on: boolean): void;
    clear(): void;
  };
}

/** Ring buffer of the last `consoleMaxLines` console lines (spec §10.3). */
export const createConsoleSlice: StateCreator<AppState, [], [], ConsoleSlice> = (set) => {
  const lines = createRing<ConsoleEntry>(CONSOLE_CAPACITY);
  const bump = () => set((s) => ({ console: { ...s.console, rev: s.console.rev + 1 } }));
  return {
    console: {
      lines,
      paused: false,
      filters: { packet: true, verdict: true, command: true, log: true },
      rev: 0,
      append: (entry) => {
        lines.push(entry);
        bump();
      },
      setPaused: (paused) => set((s) => ({ console: { ...s.console, paused } })),
      setFilter: (kind, on) => set((s) => ({ console: { ...s.console, filters: { ...s.console.filters, [kind]: on } } })), // prettier-ignore
      clear: () => {
        lines.clear();
        bump();
      },
    },
  };
};
