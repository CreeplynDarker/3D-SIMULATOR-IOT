import { describe, expect, it } from 'vitest';
import { run, summarise } from './helpers.ts';

describe('S3 looseness (§12): t=60 looseness 0.6 step; end 120', () => {
  const s = summarise(run('S3'));

  it('CRITICAL ≤ 70 s with a_rms_g or cf dominant', () => {
    expect(s.critical_s ?? Infinity).toBeGreaterThan(60);
    expect(s.critical_s ?? Infinity).toBeLessThanOrEqual(70);
    expect(['a_rms_g', 'cf']).toContain(s.firstAlertDominant);
  });
});
