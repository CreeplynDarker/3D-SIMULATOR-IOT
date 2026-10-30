import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';

describe('config', () => {
  it('idle + aero current is the 0.18 A typical rating', () => {
    expect(CONFIG.fan.iIdle_A + CONFIG.fan.iAero_A === 0.18).toBe(true);
  });

  it('keeps the OPEN-item defaults from §2', () => {
    expect(CONFIG.rcf.features).toContain('rpm'); // OPEN-1
    expect(CONFIG.sensors.acs712.sens_VperA).toBe(0.185); // OPEN-2
    expect(CONFIG.fan.tachPulsesPerRev).toBe(2); // OPEN-3
    expect(CONFIG.fan.blades).toBe(7); // OPEN-7
  });

  it('a window holds sampleRate · window_s = 1000 samples', () => {
    expect(CONFIG.firmware.sampleRate_Hz * CONFIG.firmware.window_s).toBe(1000);
  });
});
