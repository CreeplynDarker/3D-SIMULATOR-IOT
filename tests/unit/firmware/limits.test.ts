import { describe, expect, it } from 'vitest';
import {
  createLimits,
  evaluateLimits,
  type LimitInput,
  type LimitResult,
  type LimitState,
  noteVerdict,
} from '../../../src/firmware/limits.ts';
import { CONFIG } from '../../../src/shared/config.ts';
import type { State } from '../../../src/shared/protocol.ts';

const FW = CONFIG.firmware;
const HEALTHY = { i_rms_A: 0.18, rpm: 3800, t_C: 34, lastValidTemp_s: 0 };

/** Evaluates consecutive windows ending at t = 1, 2, …; returns the result of each. */
function windows(ls: LimitState, state: State, inputs: Partial<LimitInput>[], t0_s = 1): LimitResult[] {
  return inputs.map((p, k) => {
    const tEnd_s = t0_s + k;
    return evaluateLimits(ls, { state, tEnd_s, ...HEALTHY, lastValidTemp_s: tEnd_s - 0.25, ...p }, CONFIG);
  });
}
const repeat = <T>(x: T, n: number) => Array.from({ length: n }, () => x);

describe('limits (§7.3), one truth table per row', () => {
  it('healthy windows raise nothing', () => {
    const r = windows(createLimits(0), 'NORMAL', repeat({}, 5));
    expect(r.every((x) => x.trip === null && x.soft === null && !x.sensorFault && !x.linkLost)).toBe(true);
  });

  describe('I_MAX', () => {
    const over = { i_rms_A: FW.iMax_A + 0.01 };
    it('trips after nILimit consecutive windows over iMax in NORMAL or WARNING', () => {
      for (const state of ['NORMAL', 'WARNING'] as const) {
        const r = windows(createLimits(0), state, repeat(over, FW.nILimit));
        expect(r.map((x) => x.trip)).toEqual([...repeat(null, FW.nILimit - 1), 'I_MAX']);
      }
    });
    it('a window back under iMax restarts the count', () => {
      const r = windows(createLimits(0), 'NORMAL', [over, over, {}, over, over]);
      expect(r.map((x) => x.trip)).toEqual(repeat(null, 5));
    });
    it('uses the higher start limit, in a single window, while STARTING', () => {
      expect(windows(createLimits(0), 'STARTING', [{ i_rms_A: FW.iMaxStart_A - 0.01 }])[0]?.trip).toBeNull();
      expect(windows(createLimits(0), 'STARTING', [{ i_rms_A: FW.iMaxStart_A + 0.01 }])[0]?.trip).toBe('I_MAX');
    });
    it('is inactive in OFF, CALIBRATING and CRITICAL', () => {
      for (const state of ['OFF', 'CALIBRATING', 'CRITICAL'] as const) {
        expect(windows(createLimits(0), state, repeat({ i_rms_A: 1 }, 4)).every((x) => x.trip === null)).toBe(true);
      }
    });
  });

  describe('T_MAX', () => {
    it('trips on a valid t_C over tMax in STARTING, NORMAL and WARNING', () => {
      for (const state of ['STARTING', 'NORMAL', 'WARNING'] as const) {
        expect(windows(createLimits(0), state, [{ t_C: FW.tMax_C + 0.1 }])[0]?.trip).toBe('T_MAX');
        expect(windows(createLimits(0), state, [{ t_C: FW.tMax_C }])[0]?.trip).not.toBe('T_MAX');
      }
    });
    it('ignores a missing temperature and inactive states', () => {
      expect(windows(createLimits(0), 'NORMAL', [{ t_C: null }])[0]?.trip).toBeNull();
      expect(windows(createLimits(0), 'OFF', [{ t_C: 99 }])[0]?.trip).toBeNull();
    });
  });

  describe('STALL', () => {
    const slow = { rpm: FW.stallFraction * CONFIG.fan.rpmRated - 1 };
    it('trips after nStall consecutive slow windows in NORMAL or WARNING', () => {
      const r = windows(createLimits(0), 'WARNING', repeat(slow, FW.nStall));
      expect(r.map((x) => x.trip)).toEqual([...repeat(null, FW.nStall - 1), 'STALL']);
    });
    it('does not trip while STARTING (the fan is still spinning up) or after a normal window', () => {
      expect(windows(createLimits(0), 'STARTING', repeat(slow, 5)).every((x) => x.trip === null)).toBe(true);
      expect(windows(createLimits(0), 'NORMAL', [slow, slow, {}]).every((x) => x.trip === null)).toBe(true);
    });
  });

  describe('I_SOFT', () => {
    it('flags i_rms over iWarnFraction · iMax', () => {
      const edge = FW.iWarnFraction * FW.iMax_A;
      expect(windows(createLimits(0), 'NORMAL', [{ i_rms_A: edge + 0.001 }])[0]?.soft).toBe('I_SOFT');
      expect(windows(createLimits(0), 'NORMAL', [{ i_rms_A: edge - 0.001 }])[0]?.soft).toBeNull();
    });
  });

  describe('T_SOFT', () => {
    it('flags a valid t_C over tMax − tWarnMargin', () => {
      const edge = FW.tMax_C - FW.tWarnMargin_C;
      expect(windows(createLimits(0), 'NORMAL', [{ t_C: edge + 0.1 }])[0]?.soft).toBe('T_SOFT');
      expect(windows(createLimits(0), 'NORMAL', [{ t_C: edge }])[0]?.soft).toBeNull();
    });
  });

  describe('SENSOR', () => {
    it('sets sensor_fault after sensorFaultTimeout_s without a valid reading, and clears on the next one', () => {
      const ls = createLimits(0);
      const at = (tEnd_s: number, lastValidTemp_s: number) =>
        evaluateLimits(ls, { state: 'NORMAL', tEnd_s, ...HEALTHY, lastValidTemp_s }, CONFIG);
      expect(at(69, 59.75).sensorFault).toBe(false);
      const r = at(70, 59.75);
      expect(r).toMatchObject({ sensorFault: true, soft: 'SENSOR', sensorChanged: true });
      expect(at(71, 59.75).sensorChanged).toBe(false);
      expect(at(72, 71.75)).toMatchObject({ sensorFault: false, soft: null, sensorChanged: true });
    });
  });

  describe('LINK', () => {
    it('sets link_lost after lossTimeout_s without a verdict while running; a verdict clears it', () => {
      const ls = createLimits(0);
      noteVerdict(ls, 30.02);
      const at = (tEnd_s: number) => evaluateLimits(ls, { state: 'NORMAL', tEnd_s, ...HEALTHY, lastValidTemp_s: tEnd_s }, CONFIG); // prettier-ignore
      expect(at(35).linkLost).toBe(false);
      expect(at(36)).toMatchObject({ linkLost: true, linkChanged: true, trip: null, soft: null });
      expect(at(37).linkChanged).toBe(false);
      expect(noteVerdict(ls, 37.02)).toBe(true); // restored
      expect(at(38).linkLost).toBe(false);
    });
    it('does not raise link_lost while the fan is not running', () => {
      const ls = createLimits(0);
      expect(evaluateLimits(ls, { state: 'OFF', tEnd_s: 60, ...HEALTHY, lastValidTemp_s: 60 }, CONFIG).linkLost).toBe(
        false,
      );
    });
  });

  it('reports the first trip in table order when several hold', () => {
    const r = windows(createLimits(0), 'NORMAL', repeat({ i_rms_A: 1, t_C: 99, rpm: 0 }, FW.nILimit));
    expect(r.at(-1)?.trip).toBe('I_MAX');
    expect(windows(createLimits(0), 'NORMAL', [{ t_C: 99, rpm: 0 }])[0]?.trip).toBe('T_MAX');
  });
});
