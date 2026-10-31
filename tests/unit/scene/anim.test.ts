import { describe, expect, it } from 'vitest';
import { airflowPhase, bladeMix, jitterAmplitude_mm, jitterOffset_mm } from '../../../src/scene/anim.ts';
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
