import { describe, expect, it } from 'vitest';
import type { State } from '../../../src/shared/protocol.ts';
import type { WindowRow } from '../../../src/store/slices/series.ts';
import { chartData, STRIPS } from '../../../src/ui/chartData.ts';

const row = (seq: number, state: State, score: number | null = null): WindowRow => ({
  seq,
  t_s: seq + 1,
  a_rms_g: 0.12,
  cf: 2.5,
  i_rms_A: 0.18,
  t_C: seq === 3 ? null : 34,
  dtdt_C_per_min: 0,
  rpm: 3800,
  state,
  score,
  threshold: score === null ? null : 0.5,
  alert: score === null ? null : score > 0.5,
});

describe('M6 chart data (§8.2)', () => {
  it('lists the six strips with their test IDs', () => {
    expect(STRIPS.map((s) => s.testId)).toEqual(['chart-arms', 'chart-cf', 'chart-irms', 'chart-temp', 'chart-rpm', 'chart-score']); // prettier-ignore
  });

  it('keeps the last window_s seconds, with nulls where a value is missing', () => {
    const rows = Array.from({ length: 50 }, (_, k) => row(k, k < 10 ? 'STARTING' : 'NORMAL', k >= 10 ? 0.2 : null));
    const d = chartData(rows, [], 30, 0.5);
    expect(d.x[0]).toBe(21);
    expect(d.x.at(-1)).toBe(50);
    expect(d.xRange).toEqual([20, 50]);
    expect(d.columns['chart-temp'][0]?.length).toBe(30);
    expect(d.columns['chart-score'][0]?.every((v) => v === 0.2)).toBe(true);
    // threshold line falls back to the model threshold for unscored windows
    expect(d.columns['chart-score'][1]?.every((v) => v === 0.5)).toBe(true);
    const all = chartData(rows.slice(0, 5), [], 30, 0.5);
    expect(all.columns['chart-temp'][0]?.[3]).toBeNull();
    expect(all.columns['chart-score'][0]?.[0]).toBeNull();
    expect(all.xRange).toEqual([-25, 5]);
  });

  it('merges consecutive windows into state bands, and keeps the events in view as markers', () => {
    const rows = [row(0, 'STARTING'), row(1, 'NORMAL'), row(2, 'NORMAL'), row(3, 'WARNING'), row(4, 'CRITICAL')];
    const events = [
      { t_s: 0.5, type: 'CALIBRATED' as const },
      { t_s: 3.4, type: 'WARNING' as const },
      { t_s: 4.2, type: 'CRITICAL' as const },
    ];
    const d = chartData(rows, events, 30, 0.5);
    expect(d.bands).toEqual([
      { from_s: 0, to_s: 1, state: 'STARTING' },
      { from_s: 1, to_s: 3, state: 'NORMAL' },
      { from_s: 3, to_s: 4, state: 'WARNING' },
      { from_s: 4, to_s: 5, state: 'CRITICAL' },
    ]);
    expect(d.markers.map((m) => m.type)).toEqual(['CALIBRATED', 'WARNING', 'CRITICAL']);
    expect(chartData([], [], 30, 0.5)).toMatchObject({ x: [], bands: [], markers: [] });
  });
});
