import { describe, expect, it } from 'vitest';
import { run, summarise } from './helpers.ts';

describe('S7 sensor (§12): t=60 ds18b20Disconnect on; end 300', () => {
  const r = run('S7');
  const s = summarise(r);

  it('first −127 reading by 61 s', () => {
    const first = r.timeline.find((row) => row.dsReading_C === -127);
    expect(first?.t_s ?? Infinity).toBeGreaterThan(60);
    expect(first?.t_s ?? Infinity).toBeLessThanOrEqual(61);
  });

  it('sensor_fault and WARNING (SENSOR) by 72 s, never CRITICAL', () => {
    const p = r.packets.find((x) => x.sensor_fault && x.state === 'WARNING' && x.warn_reason === 'SENSOR');
    expect((p?.ts_ms ?? Infinity) / 1000).toBeLessThanOrEqual(72);
    expect(s.at('SENSOR_FAULT') ?? Infinity).toBeLessThanOrEqual(72);
    expect(s.critical_s).toBeNull();
  });
});
