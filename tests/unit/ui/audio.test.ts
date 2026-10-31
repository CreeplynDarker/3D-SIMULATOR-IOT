import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import { humFor } from '../../../src/ui/audio.ts';

describe('P6.4 hum (Web Audio parameters)', () => {
  it('pitch follows the blade-pass rate (rpm/60 · 7 blades), gain grows with a_RMS and is capped', () => {
    expect(humFor(3800, 0.12, true).freq_Hz).toBeCloseTo((3800 / 60) * CONFIG.fan.blades, 6);
    expect(humFor(0, 0, true).gain).toBe(0);
    expect(humFor(3800, 0.6, true).gain).toBeGreaterThan(humFor(3800, 0.12, true).gain);
    expect(humFor(3800, 50, true).gain).toBeLessThanOrEqual(0.2);
    expect(humFor(3800, 0.12, false).gain).toBe(0); // paused: silent
  });
});
