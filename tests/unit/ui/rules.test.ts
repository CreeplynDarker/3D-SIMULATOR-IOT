import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import { NO_FAULTS } from '../../../src/store/slices/ui.ts';
import { canReset, canStart, canTrain, modelStatusText } from '../../../src/ui/rules.ts';

describe('M5 enable rules (§8.2)', () => {
  it('btn-start only in OFF, btn-reset only in CRITICAL', () => {
    for (const s of ['OFF', 'CALIBRATING', 'STARTING', 'NORMAL', 'WARNING', 'CRITICAL'] as const) {
      expect(canStart(s)).toBe(s === 'OFF');
      expect(canReset(s)).toBe(s === 'CRITICAL');
    }
  });

  it('btn-train only in NORMAL, with no active fault and |dT/dt| ≤ warmDtdtMax', () => {
    const max = CONFIG.rcf.warmDtdtMax_C_per_min;
    expect(canTrain('NORMAL', NO_FAULTS, 0.1, max)).toBe(true);
    expect(canTrain('NORMAL', NO_FAULTS, -max, max)).toBe(true);
    expect(canTrain('NORMAL', NO_FAULTS, max + 0.01, max)).toBe(false);
    expect(canTrain('NORMAL', NO_FAULTS, null, max)).toBe(false);
    expect(canTrain('WARNING', NO_FAULTS, 0, max)).toBe(false);
    expect(canTrain('NORMAL', { ...NO_FAULTS, friction: 0.05 }, 0, max)).toBe(false);
    expect(canTrain('NORMAL', { ...NO_FAULTS, ds18b20Disconnect: true }, 0, max)).toBe(false);
  });

  it('model-status reads UNTRAINED / TRAINING n/180 / READY', () => {
    expect(modelStatusText('UNTRAINED', 0, 180)).toBe('UNTRAINED');
    expect(modelStatusText('TRAINING', 37 / 180, 180)).toBe('TRAINING 37/180');
    expect(modelStatusText('READY', 1, 180)).toBe('READY');
  });
});
