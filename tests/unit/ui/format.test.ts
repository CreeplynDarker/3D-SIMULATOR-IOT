import { describe, expect, it } from 'vitest';
import { formatClock, formatGauge, persistenceText, relayText, STATE_TONE } from '../../../src/ui/format.ts';

describe('UI formatting', () => {
  it('sim-clock reads mm:ss.s (§8.2)', () => {
    expect(formatClock(0)).toBe('00:00.0');
    expect(formatClock(65.04)).toBe('01:05.0');
    expect(formatClock(59.96)).toBe('01:00.0');
    expect(formatClock(3723.45)).toBe('62:03.5');
  });
});

describe('M3 status readouts (§8.2)', () => {
  it('relay-state reads "CH2 NO closed" / "CH2 open"', () => {
    expect(relayText('NO')).toBe('CH2 NO closed');
    expect(relayText('NC')).toBe('CH2 open');
  });

  it('persistence reads k/N and the gauge score / threshold', () => {
    expect(persistenceText(2, 5)).toBe('2/5');
    expect(formatGauge(0.2149, 0.5)).toBe('0.21 / 0.50');
    expect(formatGauge(null, 0.5)).toBe('— / 0.50');
  });

  it('state colours follow §8.1', () => {
    expect(STATE_TONE).toEqual({ OFF: 'grey', CALIBRATING: 'blue', STARTING: 'blue', NORMAL: 'green', WARNING: 'amber', CRITICAL: 'red' }); // prettier-ignore
  });
});
