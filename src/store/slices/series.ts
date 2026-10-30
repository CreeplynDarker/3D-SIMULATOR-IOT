import type { StateCreator } from 'zustand/vanilla';
import { CONFIG } from '../../shared/config.ts';
import type { SimEvent } from '../../shared/messages.ts';
import type { Packet, State, Verdict } from '../../shared/protocol.ts';
import type { AppState } from '../index.ts';
import { createRing, type Ring } from '../ring.ts';

/** Windows kept for the charts: the longest chart window divided by the feature window (600). */
export const SERIES_CAPACITY = Math.max(...CONFIG.ui.chartWindows_s) / CONFIG.firmware.window_s;

/** One feature window: the packet's chart values, filled in with its verdict when that arrives. */
export interface WindowRow {
  seq: number;
  t_s: number;
  a_rms_g: number;
  cf: number;
  i_rms_A: number;
  t_C: number | null;
  dtdt_C_per_min: number | null;
  rpm: number;
  state: State;
  score: number | null;
  threshold: number | null;
  alert: boolean | null;
}

export interface SeriesSlice {
  series: {
    windows: Ring<WindowRow>;
    events: Ring<SimEvent>;
    /** Bumped on every change; subscribe to it to redraw. */
    rev: number;
    pushPacket(packet: Packet): void;
    pushVerdict(verdict: Verdict): void;
    pushEvent(event: SimEvent): void;
    clear(): void;
  };
}

/** Ring buffers that feed the M6 charts (spec §10.3): six strips, state bands and event markers. */
export const createSeriesSlice: StateCreator<AppState, [], [], SeriesSlice> = (set) => {
  const windows = createRing<WindowRow>(SERIES_CAPACITY);
  const events = createRing<SimEvent>(SERIES_CAPACITY);
  const bump = () => set((s) => ({ series: { ...s.series, rev: s.series.rev + 1 } }));
  return {
    series: {
      windows,
      events,
      rev: 0,
      pushPacket: (p) => {
        const { seq, a_rms_g, cf, i_rms_A, t_C, dtdt_C_per_min, rpm, state } = p;
        const t_s = p.ts_ms / 1000;
        windows.push({ seq, t_s, a_rms_g, cf, i_rms_A, t_C, dtdt_C_per_min, rpm, state, ...unscored });
        bump();
      },
      pushVerdict: (v) => {
        const row = windows.findLast((r) => r.seq === v.seq_ref);
        if (!row) return;
        Object.assign(row, { score: v.score, threshold: v.threshold, alert: v.alert });
        bump();
      },
      pushEvent: (event) => {
        events.push(event);
        bump();
      },
      clear: () => {
        windows.clear();
        events.clear();
        bump();
      },
    },
  };
};

const unscored = { score: null, threshold: null, alert: null } as const;
