import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';

describe('config', () => {
  it('idle + aero current is the 0.18 A typical rating', () => {
    expect(CONFIG.fan.iIdle_A + CONFIG.fan.iAero_A === 0.18).toBe(true);
  });

  it('keeps the OPEN-item defaults from §2', () => {
    // OPEN-1 closed "no" (D-078): the report's five features, no speed sensing on the bench
    expect(CONFIG.rcf.features).toEqual(['a_rms_g', 'cf', 'i_rms_A', 't_C', 'dtdt_C_per_min']);
    expect(Object.keys(CONFIG.rcf.stdFloor)).toEqual([...CONFIG.rcf.features]);
    expect(CONFIG.sensors.acs712.sens_VperA).toBe(0.185); // OPEN-2
    expect('tachPulsesPerRev' in CONFIG.fan).toBe(false); // OPEN-3: moot, the tach is not wired
    expect(CONFIG.fan.blades).toBe(7); // OPEN-7
  });

  it('a window holds sampleRate · window_s = 1000 samples', () => {
    expect(CONFIG.firmware.sampleRate_Hz * CONFIG.firmware.window_s).toBe(1000);
  });
});
