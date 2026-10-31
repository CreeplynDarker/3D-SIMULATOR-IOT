import { describe, expect, it } from 'vitest';
import { run, summarise } from './helpers.ts';

describe('S2 imbalance (§12): t=60 imbalance_g 0.3 step; end 120', () => {
  const s = summarise(run('S2'));

  it('first alert ≤ 63 s with a_rms_g dominant', () => {
    expect(s.firstAlert_s ?? Infinity).toBeGreaterThan(60);
    expect(s.firstAlert_s ?? Infinity).toBeLessThanOrEqual(63);
    expect(s.firstAlertDominant).toBe('a_rms_g');
  });

  it('CRITICAL (RCF) ≤ 70 s, RELAY_OPEN ≤ CRITICAL + 20 ms, rpm < 100 by CRITICAL + 15 s', () => {
    const tCrit = s.critical_s ?? Infinity;
    expect(tCrit).toBeLessThanOrEqual(70);
    expect(s.tripReason).toBe('RCF');
    expect((s.relayOpen_s ?? Infinity) - tCrit).toBeLessThanOrEqual(0.02);
    expect(s.rpmBelow(100, tCrit) ?? Infinity).toBeLessThanOrEqual(tCrit + 15);
  });
});
