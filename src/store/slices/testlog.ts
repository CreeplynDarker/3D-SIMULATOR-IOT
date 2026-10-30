import type { StateCreator } from 'zustand/vanilla';
import type { AppState } from '../index.ts';

/** One M10 test-log row (spec §8.2); times are sim time. */
export interface TestRun {
  id: number;
  scenario: string;
  start_s: number;
  duration_s: number | null;
  alerted: boolean;
  firstAlert_s: number | null;
  criticalToRelay_ms: number | null;
  resetByOperator: boolean;
  notes: string;
}

export type TestRunPatch = Partial<Omit<TestRun, 'id'>>;

export interface TestlogSlice {
  testlog: {
    runs: TestRun[];
    /** Opens a run at sim time `start_s`; returns its id. */
    startRun(scenario: string, start_s: number): number;
    updateRun(id: number, patch: TestRunPatch): void;
    /** Closes a run at sim time `end_s`. */
    stopRun(id: number, end_s: number): void;
    clear(): void;
  };
}

/** Test runs recorded by the operator (spec §10.3). */
export const createTestlogSlice: StateCreator<AppState, [], [], TestlogSlice> = (set, get) => {
  let nextId = 1;
  const update = (id: number, patch: TestRunPatch) =>
    set((s) => ({
      testlog: { ...s.testlog, runs: s.testlog.runs.map((r) => (r.id === id ? { ...r, ...patch } : r)) },
    }));
  return {
    testlog: {
      runs: [],
      startRun: (scenario, start_s) => {
        const run: TestRun = {
          id: nextId++,
          scenario,
          start_s,
          duration_s: null,
          alerted: false,
          firstAlert_s: null,
          criticalToRelay_ms: null,
          resetByOperator: false,
          notes: '',
        };
        set((s) => ({ testlog: { ...s.testlog, runs: [...s.testlog.runs, run] } }));
        return run.id;
      },
      updateRun: update,
      stopRun: (id, end_s) => {
        const run = get().testlog.runs.find((r) => r.id === id);
        if (run) update(id, { duration_s: end_s - run.start_s });
      },
      clear: () => set((s) => ({ testlog: { ...s.testlog, runs: [] } })),
    },
  };
};
