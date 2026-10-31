// M6 chart data (spec §8.2): the rows of the series slice cut to the chart window and laid out as uPlot columns,
// plus state bands and event markers. Pure: it rearranges values, it computes no features.
import { CONFIG } from '../shared/config.ts';
import type { SimEvent } from '../shared/messages.ts';
import type { State } from '../shared/protocol.ts';
import type { WindowRow } from '../store/slices/series.ts';

export type StripId = 'chart-arms' | 'chart-cf' | 'chart-irms' | 'chart-temp' | 'chart-rpm' | 'chart-score';

export interface StripSpec {
  testId: StripId;
  title: string;
  /** One label per series; the temperature strip's second series uses a second axis. */
  series: string[];
}

export const STRIPS: readonly StripSpec[] = [
  { testId: 'chart-arms', title: 'a_RMS (g)', series: ['a_rms'] },
  { testId: 'chart-cf', title: 'Crest factor', series: ['cf'] },
  { testId: 'chart-irms', title: 'I_RMS (A)', series: ['i_rms'] },
  { testId: 'chart-temp', title: 'T (°C) · dT/dt (°C/min)', series: ['T', 'dT/dt'] },
  { testId: 'chart-rpm', title: 'RPM', series: ['rpm'] },
  { testId: 'chart-score', title: 'RCF score · threshold', series: ['score', 'threshold'] },
];

export interface Band {
  from_s: number;
  to_s: number;
  state: State;
}

export interface ChartData {
  /** Window end times (s of sim time). */
  x: number[];
  xRange: [number, number];
  columns: Record<StripId, (number | null)[][]>;
  bands: Band[];
  markers: SimEvent[];
}

const WINDOW_s = CONFIG.firmware.window_s;

/** Columns for every strip over the last `window_s` seconds; `threshold` fills the line where no verdict came. */
export function chartData(
  rows: readonly WindowRow[],
  events: readonly SimEvent[],
  window_s: number,
  threshold: number,
): ChartData {
  // prettier-ignore
  const tEnd_s = rows.at(-1)?.t_s ?? 0;
  const xRange: [number, number] = [tEnd_s - window_s, tEnd_s];
  const view = rows.filter((r) => r.t_s > xRange[0]);
  const col = (f: (r: WindowRow) => number | null) => view.map(f);
  const bands: Band[] = [];
  for (const r of view) {
    const last = bands.at(-1);
    if (last && last.state === r.state && Math.abs(last.to_s - (r.t_s - WINDOW_s)) < 1e-9) last.to_s = r.t_s;
    else bands.push({ from_s: r.t_s - WINDOW_s, to_s: r.t_s, state: r.state });
  }
  return {
    x: view.map((r) => r.t_s),
    xRange,
    columns: {
      'chart-arms': [col((r) => r.a_rms_g)],
      'chart-cf': [col((r) => r.cf)],
      'chart-irms': [col((r) => r.i_rms_A)],
      'chart-temp': [col((r) => r.t_C), col((r) => r.dtdt_C_per_min)],
      'chart-rpm': [col((r) => r.rpm)],
      'chart-score': [col((r) => r.score), col((r) => r.threshold ?? threshold)],
    },
    bands,
    markers: events.filter((e) => e.t_s > xRange[0] - WINDOW_s && e.t_s <= xRange[1]),
  };
}

/** Y range for a strip: 10 % padding, or ±0.5 around a flat line (uPlot would otherwise stretch it from 0). */
export function yRange(min: number | null, max: number | null): [number, number] {
  if (min === null || max === null) return [0, 1];
  const span = max - min;
  const pad = span > 0 ? span * 0.1 : 0.5;
  return [min - pad, max + pad];
}
