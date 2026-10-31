import { describe, expect, it } from 'vitest';
import { run, summarise } from './helpers.ts';

describe('S5 overheat (§12): t=60 overheat 1.0 step; end 140', () => {
  const s = summarise(run('S5'));

  it('CRITICAL ≤ 80 s with t_C or dtdt_C_per_min dominant', () => {
    expect(s.critical_s ?? Infinity).toBeGreaterThan(60);
    expect(s.critical_s ?? Infinity).toBeLessThanOrEqual(80);
    expect(['t_C', 'dtdt_C_per_min']).toContain(s.firstAlertDominant);
  });
});
