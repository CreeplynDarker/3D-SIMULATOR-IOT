import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import { createSampler, type DsRead, samplerTick, type WindowData } from '../../../src/firmware/sampler.ts';
import { createPlant, runPlant, type SensorsView } from '../../../src/sim/plant.ts';
import { GPIO_LOW } from '../../../src/sim/types.ts';

interface Closed {
  /** scalar fields copied at close time (the buffers are reused two windows later) */
  window: Pick<WindowData, 'index' | 'tEnd_s' | 'n' | 'edges'>;
  /** copies, since the sampler reuses its buffers */
  ax: number[];
  ay: number[];
  counts: number[];
  revs: number;
}

/** Runs the plant with the fan on and a sampler as the firmware; records windows and DS18B20 reads. */
function run(t_s: number) {
  const plant = createPlant(CONFIG, CONFIG.seed, { warmStart: true });
  const sampler = createSampler(CONFIG);
  const windows: Closed[] = [];
  const reads: DsRead[] = [];
  let theta0 = 0;
  runPlant(
    plant,
    {
      tick(view: SensorsView) {
        const out = samplerTick(sampler, view);
        if (out.window) {
          const w = out.window;
          const revs = (plant.fan.theta_rad - theta0) / (2 * Math.PI);
          theta0 = plant.fan.theta_rad;
          windows.push({
            window: { index: w.index, tEnd_s: w.tEnd_s, n: w.n, edges: w.edges },
            ax: [...w.ax_g.subarray(0, w.n)],
            ay: [...w.ay_g.subarray(0, w.n)],
            counts: [...w.counts.subarray(0, w.n)],
            revs,
          });
        }
        if (out.dsRead) reads.push(out.dsRead);
        return GPIO_LOW;
      },
    },
    t_s,
  );
  return { windows, reads };
}

describe('sampler (§7.1)', () => {
  const { windows, reads } = run(6.001);

  it('collects 1,000 accel and ADC samples per window and closes window k at k + 1 s', () => {
    expect(windows).toHaveLength(6);
    windows.forEach(({ window: w, ax, counts }, k) => {
      expect(w.index).toBe(k);
      expect(w.tEnd_s).toBeCloseTo(k + 1, 9);
      expect(w.n).toBe(1000);
      expect(ax).toHaveLength(1000);
      expect(counts.every((c) => Number.isInteger(c) && c >= 0 && c <= 4095)).toBe(true);
    });
    // the board lies flat: y carries 1 g of gravity
    const y = windows[5]?.ay ?? [];
    expect(y.reduce((a, b) => a + b, 0) / y.length).toBeCloseTo(1, 1);
  });

  it('keeps a closed window intact while the next one fills', () => {
    const sampler = createSampler(CONFIG);
    const view = (t_s: number, x: number): SensorsView => ({
      t_s,
      accel_g: Float64Array.of(x, 1, 0),
      adcCounts: 1500,
      dsReading_C: 30,
      dsReadings: 0,
      tachEdges: 0,
    });
    let closed: WindowData | null = null;
    for (let k = 0; k <= 1500; k++) {
      const out = samplerTick(sampler, view(k / 1000, k));
      if (out.window) closed = out.window;
    }
    expect(closed?.index).toBe(0);
    expect(closed?.ax_g[0]).toBe(0);
    expect(closed?.ax_g[999]).toBe(999);
  });

  it('requests a DS18B20 conversion every 1 s and reads it 0.75 s later', () => {
    expect(reads.map((r) => Number(r.t_s.toFixed(4)))).toEqual([0.75, 1.75, 2.75, 3.75, 4.75, 5.75]);
    expect(reads[0]?.value_C).toBe(CONFIG.sensors.ds18b20.powerOn_C);
    for (const r of reads.slice(1))
      expect(Number.isInteger(r.value_C / CONFIG.sensors.ds18b20.resolution_C)).toBe(true);
  });

  it('counts tach edges per window: the plant revolutions × 2 ± 1', () => {
    for (const { window: w, revs } of windows) {
      expect(Math.abs(w.edges - 2 * revs)).toBeLessThanOrEqual(1);
    }
    expect(windows[5]?.window.edges).toBeGreaterThan(120); // ≈ 3,800 rpm · 2 / 60
  });
});
