import { describe, expect, it } from 'vitest';
import { run, summarise } from './helpers.ts';

describe('S8 reset-flow (§12): imbalance at 60; START at CRITICAL+1, clearFaults +5, RESET +20, START +21; end +45', () => {
  const r = run('S8');
  const s = summarise(r);
  const tCrit = s.critical_s ?? NaN;

  it('START at +1 is refused, RESET is accepted', () => {
    expect(tCrit).toBeLessThanOrEqual(70);
    expect(s.at('REFUSED', tCrit)).toBeCloseTo(tCrit + 1, 6);
    expect(r.logs.some((l) => l.includes('ERR fsm: start refused: latched'))).toBe(true);
    expect(s.at('RESET', tCrit)).toBeCloseTo(tCrit + 20, 6);
  });

  it('NORMAL reached by +33, no CRITICAL after the RESET, run ends at +45', () => {
    const tReset = s.at('RESET', tCrit) ?? Infinity;
    expect(s.at('NORMAL', tReset) ?? Infinity).toBeLessThanOrEqual(tCrit + 33);
    expect(s.at('CRITICAL', tReset)).toBeNull();
    expect(s.criticals).toBe(1);
    expect(r.timeline.at(-1)?.t_s).toBeCloseTo(Math.floor(tCrit + 45), 6);
  });
});
