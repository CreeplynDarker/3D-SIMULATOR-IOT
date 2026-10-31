import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import { GUIDED, guidedFor, reachedStep } from '../../../src/shared/guided.ts';
import { SCENARIOS } from '../../../src/shared/scenarios.ts';

const PRESETS = ['overview', 'fan', 'esp32', 'relay', 'breadboard'];
const CHARTS = ['chart-arms', 'chart-cf', 'chart-irms', 'chart-temp', 'chart-rpm', 'chart-score'];

describe('M11 guided scenarios data (P6.6)', () => {
  it('covers exactly the scenarios marked guided in §12', () => {
    expect(GUIDED.map((g) => g.id)).toEqual(SCENARIOS.filter((s) => s.guided).map((s) => s.id));
    expect(guidedFor('S3')).toBeNull();
  });

  it('every run fits in about 90 s of wall time at its speed, and every step is complete', () => {
    for (const g of GUIDED) {
      const s = SCENARIOS.find((x) => x.id === g.id);
      expect((CONFIG.ui.speeds as readonly number[]).includes(g.speed), g.id).toBe(true);
      expect((s?.end_s ?? Infinity) / g.speed, g.id).toBeLessThanOrEqual(90);
      expect(g.steps.length, g.id).toBeGreaterThanOrEqual(3);
      expect(g.steps.at(-1)?.when, g.id).toEqual({ done: true });
      for (const step of g.steps) {
        expect(PRESETS, `${g.id} ${step.title}`).toContain(step.camera);
        expect(CHARTS, `${g.id} ${step.title}`).toContain(step.chart);
        for (const text of [step.title, step.watch, step.injected, step.meaning])
          expect(text.length).toBeGreaterThan(3);
      }
    }
  });

  it('reachedStep is the furthest step whose trigger has fired: sim time, an event (+offset) or the end', () => {
    const steps = guidedFor('S2')?.steps ?? [];
    const ev = (type: string, t_s: number) => ({ type, t_s }) as never;
    expect(reachedStep(steps, { t_s: 0, events: [], done: false })).toBe(0);
    expect(reachedStep(steps, { t_s: 20, events: [ev('NORMAL', 10.5)], done: false })).toBe(1);
    expect(reachedStep(steps, { t_s: 61, events: [ev('NORMAL', 10.5)], done: false })).toBe(2);
    expect(reachedStep(steps, { t_s: 66, events: [ev('NORMAL', 10.5), ev('WARNING', 61), ev('CRITICAL', 65)], done: false })).toBe(4); // prettier-ignore
    expect(reachedStep(steps, { t_s: 120, events: [], done: true })).toBe(steps.length - 1);
  });
});
