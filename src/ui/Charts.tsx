// M6 live charts (spec §8.2): six uPlot strips with synced cursors, state bands and event markers. React renders
// the frame once; the plots are updated imperatively from a store subscription, never by re-rendering (D-049).
import { type RefObject, useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { CONFIG } from '../shared/config.ts';
import type { SimEventType } from '../shared/messages.ts';
import { appStore, useAppStore } from '../store/index.ts';
import type { Theme } from '../store/slices/ui.ts';
import { type ChartData, chartData, type StripId, type StripSpec, STRIPS, yRange } from './chartData.ts';
import { STATE_TONE, type Tone } from './format.ts';
import { ToggleButton } from './kit.tsx';

const SYNC_KEY = 'm6';
const LINE = ['#0ea5e9', '#f97316'];
const BAND_RGBA: Record<Tone, string> = {
  grey: 'rgba(100,116,139,0.10)',
  blue: 'rgba(14,165,233,0.12)',
  green: 'rgba(16,185,129,0.10)',
  amber: 'rgba(245,158,11,0.18)',
  red: 'rgba(239,68,68,0.20)',
};
const MARKER: Partial<Record<SimEventType, string>> = {
  FAULT_SET: '#a855f7',
  WARNING: '#f59e0b',
  CRITICAL: '#ef4444',
  RELAY_OPEN: '#f97316',
  RESET: '#64748b',
  LINK_LOST: '#ec4899',
  SENSOR_FAULT: '#ec4899',
};
const AXIS = { dark: '#94a3b8', light: '#475569' };

/** Shaded state bands behind the plot. */
function drawBands(u: uPlot, d: ChartData): void {
  const { ctx, bbox } = u;
  ctx.save();
  for (const b of d.bands) {
    const x0 = u.valToPos(b.from_s, 'x', true);
    const x1 = u.valToPos(b.to_s, 'x', true);
    ctx.fillStyle = BAND_RGBA[STATE_TONE[b.state]];
    ctx.fillRect(x0, bbox.top, x1 - x0, bbox.height);
  }
  ctx.restore();
}

/** Vertical event markers over the plot. */
function drawMarkers(u: uPlot, d: ChartData): void {
  const { ctx, bbox } = u;
  ctx.save();
  ctx.lineWidth = 1;
  for (const m of d.markers) {
    const color = MARKER[m.type];
    if (!color) continue;
    const x = Math.round(u.valToPos(m.t_s, 'x', true)) + 0.5;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, bbox.top);
    ctx.lineTo(x, bbox.top + bbox.height);
    ctx.stroke();
  }
  ctx.restore();
}

/** uPlot options for one strip; `data()` returns the latest chart data for the range and the hooks. */
function options(
  spec: StripSpec,
  size: { width: number; height: number },
  theme: Theme,
  data: () => ChartData,
): uPlot.Options {
  // prettier-ignore
  const twoAxes = spec.testId === 'chart-temp';
  const axis = { stroke: AXIS[theme], grid: { stroke: theme === 'dark' ? '#1e293b' : '#e2e8f0' }, size: 44, font: '10px sans-serif' }; // prettier-ignore
  return {
    ...size,
    legend: { show: false },
    cursor: { sync: { key: SYNC_KEY }, drag: { x: false, y: false } },
    scales: {
      x: { time: false, range: () => data().xRange },
      y: { range: (_u, min, max) => yRange(min, max) },
      y2: { range: (_u, min, max) => yRange(min, max) },
    },
    series: [
      {},
      ...spec.series.map((label, i) => ({
        label,
        stroke: LINE[i] ?? AXIS[theme],
        width: 1.5,
        scale: twoAxes && i === 1 ? 'y2' : 'y',
        ...(spec.testId === 'chart-score' && i === 1 ? { dash: [4, 4] } : {}),
      })),
    ],
    axes: [
      { ...axis, size: 24 },
      { ...axis, scale: 'y' },
      // Every strip reserves the same right-hand gutter, so the plot areas (and synced cursors) line up.
      twoAxes
        ? { ...axis, scale: 'y2', side: 1, grid: { show: false } }
        : { ...axis, scale: 'y', side: 1, grid: { show: false }, ticks: { show: false }, values: () => [] },
    ],
    hooks: { drawClear: [(u) => drawBands(u, data())], draw: [(u) => drawMarkers(u, data())] },
  };
}

/** Creates the six plots, keeps them sized and fed from the store, and tears them down on unmount. */
function usePlots(hosts: RefObject<Partial<Record<StripId, HTMLDivElement | null>>>, theme: Theme): void {
  useEffect(() => {
    let latest: ChartData = chartData([], [], CONFIG.ui.chartWindowDefault_s, CONFIG.rcf.threshold);
    const plots: { id: StripId; u: uPlot; host: HTMLDivElement }[] = [];
    for (const spec of STRIPS) {
      const host = hosts.current[spec.testId];
      if (!host) continue;
      const size = { width: Math.max(100, host.clientWidth), height: Math.max(60, host.clientHeight) };
      const u = new uPlot(
        options(spec, size, theme, () => latest),
        [[]],
        host,
      );
      plots.push({ id: spec.testId, u, host });
    }
    const update = () => {
      const s = appStore.getState();
      if (s.ui.chartFrozen) return;
      latest = chartData(s.series.windows.toArray(), s.series.events.toArray(), s.ui.chartWindow_s, s.model.threshold);
      for (const p of plots) {
        p.u.setData([latest.x, ...latest.columns[p.id]] as uPlot.AlignedData);
        const wrapper = p.host.parentElement;
        wrapper?.setAttribute('data-points', String(latest.x.length));
        wrapper?.setAttribute('data-last-t', String(latest.x.at(-1) ?? ''));
      }
    };
    update();
    const unsubscribe = appStore.subscribe((s, prev) => {
      if (s.series.rev !== prev.series.rev || s.ui.chartWindow_s !== prev.ui.chartWindow_s || s.ui.chartFrozen !== prev.ui.chartFrozen) update(); // prettier-ignore
    });
    const resize = new ResizeObserver(() => {
      for (const p of plots) p.u.setSize({ width: Math.max(100, p.host.clientWidth), height: Math.max(60, p.host.clientHeight) }); // prettier-ignore
    });
    for (const p of plots) resize.observe(p.host);
    return () => {
      unsubscribe();
      resize.disconnect();
      for (const p of plots) p.u.destroy();
    };
  }, [hosts, theme]);
}

/** The M6 tab: window selector, freeze, and the six strips in a 3 × 2 grid. */
export function Charts() {
  const window_s = useAppStore((s) => s.ui.chartWindow_s);
  const frozen = useAppStore((s) => s.ui.chartFrozen);
  const theme = useAppStore((s) => s.ui.theme);
  const hosts = useRef<Partial<Record<StripId, HTMLDivElement | null>>>({});
  usePlots(hosts, theme);
  const ui = appStore.getState().ui;
  return (
    <div className="flex h-full flex-col p-1">
      <div className="flex items-center gap-2 px-1 pb-1 text-xs">
        <label>
          Window{' '}
          <select
            data-testid="sel-chart-window"
            value={window_s}
            onChange={(e) => ui.setChartWindow(Number(e.target.value))}
            className="rounded border border-slate-400 bg-white px-1 dark:border-slate-600 dark:bg-slate-800"
          >
            {CONFIG.ui.chartWindows_s.map((w) => (
              <option key={w} value={w}>
                {w} s
              </option>
            ))}
          </select>
        </label>
        <ToggleButton
          testId="btn-chart-freeze"
          label={frozen ? 'Frozen' : 'Freeze'}
          on={frozen}
          onChange={ui.setChartFrozen}
        />
        <span className="text-slate-500">Bands: state · lines: faults, warnings, trips, relay</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-1">
        {STRIPS.map((spec) => (
          <div key={spec.testId} data-testid={spec.testId} className="flex min-h-0 min-w-0 flex-col">
            <span className="px-1 text-[10px] text-slate-500 dark:text-slate-400">{spec.title}</span>
            <div ref={(el) => void (hosts.current[spec.testId] = el)} className="min-h-0 flex-1 overflow-hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}
