import { describe, expect, it } from 'vitest';
import {
  airflowPhase,
  bezier,
  bladeMix,
  continuousU,
  fade,
  jitterAmplitude_mm,
  jitterOffset_mm,
  pulseU,
  travel_s,
  wireEnergised,
} from '../../../src/scene/anim.ts';
import { CONFIG } from '../../../src/shared/config.ts';

const ui = CONFIG.ui;

describe('P6.1 fan animation math', () => {
  it('blades show below bladeBlurRpm and crossfade to the blur disc up to twice that', () => {
    expect(bladeMix(0, ui.bladeBlurRpm)).toBe(0);
    expect(bladeMix(ui.bladeBlurRpm, ui.bladeBlurRpm)).toBe(0);
    expect(bladeMix(1.5 * ui.bladeBlurRpm, ui.bladeBlurRpm)).toBeCloseTo(0.5, 9);
    expect(bladeMix(3800, ui.bladeBlurRpm)).toBe(1);
  });

  it('jitter amplitude is min(vibVisualMax_mm, a_rms · vibVisual_mm_per_g · exaggeration)', () => {
    expect(jitterAmplitude_mm(0.12, 10, ui)).toBeCloseTo(0.12 * 0.5 * 10, 9);
    expect(jitterAmplitude_mm(0.62, 50, ui)).toBe(ui.vibVisualMax_mm);
    expect(jitterAmplitude_mm(0, 50, ui)).toBe(0);
  });

  it('jitter turns at vibVisual_Hz with its phase from sim time', () => {
    const A = 2;
    expect(jitterOffset_mm(A, 0, ui.vibVisual_Hz)).toEqual([0, A]);
    const quarter_s = 1 / (4 * ui.vibVisual_Hz);
    const [x, y] = jitterOffset_mm(A, quarter_s, ui.vibVisual_Hz);
    expect(x).toBeCloseTo(A, 9);
    expect(y).toBeCloseTo(0, 9);
    const p1 = jitterOffset_mm(A, 12.3, ui.vibVisual_Hz);
    const p2 = jitterOffset_mm(A, 12.3 + 1 / ui.vibVisual_Hz, ui.vibVisual_Hz);
    expect(p2[0]).toBeCloseTo(p1[0], 9);
    expect(p2[1]).toBeCloseTo(p1[1], 9);
  });

  it('airflow streaks advance with sim time at a speed set by rpm, and stand still with the fan', () => {
    expect(airflowPhase(5, 0, 3800, 0, 4)).toBe(airflowPhase(9, 0, 3800, 0, 4));
    const a = airflowPhase(10, 0, 3800, 3800, 4);
    const b = airflowPhase(10.1, 0, 3800, 3800, 4);
    expect(b).not.toBe(a);
    for (const u of [a, b, airflowPhase(10, 3, 3800, 3800, 4)]) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });
});

describe('P6.2 signal-flow math', () => {
  it('energised rules of §13.3: V12_SW iff NO closed, RELAY_IN while GPIO26 is LOW, the rest always', () => {
    expect(wireEnergised('V12_SW', 'NO', 1)).toBe(true);
    expect(wireEnergised('V12_SW', 'NC', 0)).toBe(false);
    expect(wireEnergised('RELAY_IN', 'NC', 0)).toBe(true);
    expect(wireEnergised('RELAY_IN', 'NO', 1)).toBe(false);
    for (const net of ['V12', 'GND', 'V5', 'V3V3', 'SDA', 'SCL', 'ONEWIRE', 'ANALOG', 'TACH'] as const) {
      expect(wireEnergised(net, 'NC', 1)).toBe(true);
    }
  });

  it('a one-shot pulse runs 0→1 over its travel time after the event, and is absent otherwise', () => {
    expect(pulseU(10.1, 10, 0.4)).toBeCloseTo(0.25, 9);
    expect(pulseU(9.9, 10, 0.4)).toBeNull();
    expect(pulseU(10.5, 10, 0.4)).toBeNull();
    expect(pulseU(5, -Infinity, 0.4)).toBeNull();
  });

  it('travel time is a fixed share of wall time, capped below one window; continuous trains wrap 0…1', () => {
    expect(travel_s(1, 0.35, 0.8)).toBeCloseTo(0.35, 9);
    expect(travel_s(10, 0.35, 0.8)).toBe(0.8);
    expect(continuousU(2.25, 2, 1, 4)).toBeCloseTo(0.75, 9);
    expect(continuousU(2.5, 2, 0, 4)).toBe(0);
  });

  it('a drop flash fades from 1 to 0, and the arc follows a quadratic Bézier', () => {
    expect(fade(3, 3, 0.8)).toBe(1);
    expect(fade(3.4, 3, 0.8)).toBeCloseTo(0.5, 9);
    expect(fade(4, 3, 0.8)).toBe(0);
    expect(fade(2, 3, 0.8)).toBe(0);
    expect(bezier([0, 0, 0], [1, 2, 0], [2, 0, 0], 0.5)).toEqual([1, 1, 0]);
  });
});
