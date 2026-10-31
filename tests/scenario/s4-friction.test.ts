import { describe, expect, it } from 'vitest';
import { run, summarise } from './helpers.ts';

describe('S4 friction (§12): t=60 friction → 0.5, ramp 30 s; end 140', () => {
  const s = summarise(run('S4'));

  it('CRITICAL ≤ 75 s for RCF or I_MAX, with i_rms_A or rpm dominant', () => {
    expect(s.critical_s ?? Infinity).toBeGreaterThan(60);
    expect(s.critical_s ?? Infinity).toBeLessThanOrEqual(75);
    expect(['RCF', 'I_MAX']).toContain(s.tripReason);
    expect(['i_rms_A', 'rpm']).toContain(s.firstAlertDominant);
  });
});
