import { describe, expect, it } from 'vitest';
import { run, summarise } from './helpers.ts';

describe('S6 wifi-loss (§12): t=30 packetLoss 1.0; t=60 overheat 1.0; end 420', () => {
  const r = run('S6');
  const s = summarise(r);

  it('link_lost by 36 s and no verdict delivered after 30.1 s', () => {
    expect(s.at('LINK_LOST') ?? Infinity).toBeLessThanOrEqual(36);
    expect(r.timeline.find((row) => row.t_s === 37)?.linkLost).toBe(true);
    expect(r.packets.every((p) => p.ts_ms <= 30_000)).toBe(true);
    const late = r.verdicts.filter((v) => v.delivered_s !== null && v.delivered_s > 30.1);
    expect(late).toEqual([]);
  });

  it('CRITICAL with reason T_MAX at 280–340 s', () => {
    expect(s.critical_s ?? Infinity).toBeGreaterThanOrEqual(280);
    expect(s.critical_s ?? Infinity).toBeLessThanOrEqual(340);
    expect(s.tripReason).toBe('T_MAX');
  });
});
