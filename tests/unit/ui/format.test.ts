import { describe, expect, it } from 'vitest';
import { formatClock } from '../../../src/ui/format.ts';

describe('UI formatting', () => {
  it('sim-clock reads mm:ss.s (§8.2)', () => {
    expect(formatClock(0)).toBe('00:00.0');
    expect(formatClock(65.04)).toBe('01:05.0');
    expect(formatClock(59.96)).toBe('01:00.0');
    expect(formatClock(3723.45)).toBe('62:03.5');
  });
});
