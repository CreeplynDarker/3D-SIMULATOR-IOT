import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/shared/config.ts';
import { run, summarise } from './helpers.ts';

describe('S1 baseline (§12): run 600 s', () => {
  const s = summarise(run('S1'));

  it('never CRITICAL, ≤ 2 alert verdicts, max score < threshold, final state NORMAL', () => {
    expect(s.critical_s).toBeNull();
    expect(s.alerts).toBeLessThanOrEqual(2);
    expect(s.maxScore).not.toBeNull();
    expect(s.maxScore ?? 1).toBeLessThan(CONFIG.rcf.threshold);
    expect(s.finalState).toBe('NORMAL');
  });
});
