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

export interface ConsoleSlice {
  console: {
    lines: Ring<ConsoleEntry>;
    paused: boolean;
    /** Bumped on every change; subscribe to it to redraw. */
    rev: number;
    append(entry: ConsoleEntry): void;
    setPaused(paused: boolean): void;
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
      rev: 0,
      append: (entry) => {
        lines.push(entry);
        bump();
      },
      setPaused: (paused) => set((s) => ({ console: { ...s.console, paused } })),
      clear: () => {
        lines.clear();
        bump();
      },
    },
  };
};
