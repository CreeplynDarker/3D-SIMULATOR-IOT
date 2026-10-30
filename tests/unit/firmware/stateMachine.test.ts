import { describe, expect, it } from 'vitest';
import { createFsm, type Fsm, TRANSITIONS, transition, type Trigger } from '../../../src/firmware/stateMachine.ts';
import { CONFIG } from '../../../src/shared/config.ts';
import type { State } from '../../../src/shared/protocol.ts';
import { GPIO_HIGH, GPIO_LOW } from '../../../src/sim/types.ts';

const FW = CONFIG.firmware;
const START: Trigger = { kind: 'cmd', cmd: 'START' };
const RESET: Trigger = { kind: 'cmd', cmd: 'RESET' };
const ESTOP: Trigger = { kind: 'cmd', cmd: 'ESTOP' };
const ALERT: Trigger = { kind: 'verdict', alert: true, clear: false };
const CLEAR: Trigger = { kind: 'verdict', alert: false, clear: true };
const QUIET: Trigger = { kind: 'verdict', alert: false, clear: false };

/** A machine already in `state` (reached through the table, so its outputs are consistent). */
function inState(state: State): Fsm {
  const f = createFsm();
  const path: Record<State, Trigger[]> = {
    OFF: [],
    CALIBRATING: [START],
    STARTING: [START, { kind: 'calibDone' }],
    NORMAL: [START, { kind: 'calibDone' }, { kind: 'graceDone' }],
    WARNING: [START, { kind: 'calibDone' }, { kind: 'graceDone' }, ALERT],
    CRITICAL: [START, { kind: 'calibDone' }, ESTOP],
  };
  for (const t of path[state]) transition(f, t, CONFIG);
  expect(f.state).toBe(state);
  return f;
}

describe('state machine (§7.4): one test per transition row', () => {
  it('OFF + START → CALIBRATING (sm.off.start)', () => {
    const f = createFsm();
    const out = transition(f, START, CONFIG);
    expect(f.state).toBe('CALIBRATING');
    expect(out).toMatchObject({ map: 'sm.off.start', from: 'OFF', to: 'CALIBRATING', events: ['START'] });
    expect(out.log[0]?.level).toBe('INFO');
    expect(f.gpio26).toBe(GPIO_HIGH);
  });

  it('CALIBRATING + calib_s elapsed → STARTING, GPIO26 LOW (sm.calib.done)', () => {
    const f = inState('CALIBRATING');
    const out = transition(f, { kind: 'calibDone' }, CONFIG);
    expect(out).toMatchObject({ map: 'sm.calib.done', to: 'STARTING', events: ['CALIBRATED'] });
    expect(f.gpio26).toBe(GPIO_LOW);
  });

  it('STARTING + startGrace_s elapsed → NORMAL, counters reset (sm.start.done)', () => {
    const f = inState('STARTING');
    f.alertRun = 3;
    f.clearRun = 2;
    expect(transition(f, { kind: 'graceDone' }, CONFIG)).toMatchObject({ map: 'sm.start.done', to: 'NORMAL' });
    expect([f.alertRun, f.clearRun]).toEqual([0, 0]);
  });

  it('STARTING + T_MAX or I_MAX (start limit) → CRITICAL, trip', () => {
    for (const reason of ['T_MAX', 'I_MAX'] as const) {
      const f = inState('STARTING');
      const out = transition(f, { kind: 'trip', reason }, CONFIG);
      expect(out).toMatchObject({ to: 'CRITICAL', events: ['CRITICAL'] });
      expect(out.map).toBe(reason === 'T_MAX' ? 'sm.limit.tmax' : 'sm.limit.imax');
      expect(f).toMatchObject({ tripReason: reason, gpio26: GPIO_HIGH });
      expect(out.log.some((l) => l.level === 'ERR')).toBe(true);
    }
  });

  it('NORMAL + verdict alert, link up → WARNING, alertRun = 1, warn_reason RCF (sm.normal.alert)', () => {
    const f = inState('NORMAL');
    expect(transition(f, ALERT, CONFIG)).toMatchObject({ map: 'sm.normal.alert', to: 'WARNING' });
    expect(f).toMatchObject({ alertRun: 1, warnReason: 'RCF', gpio26: GPIO_LOW });
  });

  it('NORMAL + verdict alert while link_lost → stays NORMAL (guard)', () => {
    const f = inState('NORMAL');
    f.linkLost = true;
    expect(transition(f, ALERT, CONFIG).to).toBeNull();
    expect(f.state).toBe('NORMAL');
  });

  it('NORMAL + I_SOFT / T_SOFT / SENSOR → WARNING with that warn_reason (sm.normal.soft)', () => {
    for (const reason of ['I_SOFT', 'T_SOFT', 'SENSOR'] as const) {
      const f = inState('NORMAL');
      expect(transition(f, { kind: 'soft', reason }, CONFIG)).toMatchObject({ map: 'sm.normal.soft', to: 'WARNING' });
      expect(f.warnReason).toBe(reason);
    }
  });

  it('WARNING + verdict alert with alertRun ≥ nCritical after increment → CRITICAL (RCF) (sm.warn.trip)', () => {
    const f = inState('WARNING'); // alertRun = 1
    for (let k = 2; k < FW.nCritical; k++) expect(transition(f, ALERT, CONFIG).map).toBe('sm.warn.alert');
    const out = transition(f, ALERT, CONFIG);
    expect(out).toMatchObject({ map: 'sm.warn.trip', to: 'CRITICAL' });
    expect(f).toMatchObject({ tripReason: 'RCF', gpio26: GPIO_HIGH, alertRun: FW.nCritical });
  });

  it('WARNING + verdict clear with clearRun ≥ nClear after increment → NORMAL, warn_reason null (sm.warn.clear)', () => {
    const f = inState('WARNING');
    for (let k = 1; k < FW.nClear; k++) expect(transition(f, CLEAR, CONFIG).to).toBeNull();
    expect(transition(f, CLEAR, CONFIG)).toMatchObject({ map: 'sm.warn.clear', to: 'NORMAL' });
    expect(f.warnReason).toBeNull();
  });

  it('WARNING: clear verdicts do not count while a soft or sensor condition holds', () => {
    const f = inState('WARNING');
    f.softActive = true;
    for (let k = 0; k < FW.nClear + 2; k++) transition(f, CLEAR, CONFIG);
    expect(f.state).toBe('WARNING');
    expect(f.clearRun).toBe(0);
  });

  it('NORMAL, WARNING + I_MAX / T_MAX / STALL → CRITICAL with that reason', () => {
    const maps = { I_MAX: 'sm.limit.imax', T_MAX: 'sm.limit.tmax', STALL: 'sm.limit.stall' } as const;
    for (const state of ['NORMAL', 'WARNING'] as const) {
      for (const reason of ['I_MAX', 'T_MAX', 'STALL'] as const) {
        const f = inState(state);
        expect(transition(f, { kind: 'trip', reason }, CONFIG)).toMatchObject({ map: maps[reason], to: 'CRITICAL' });
        expect(f.tripReason).toBe(reason);
      }
    }
  });

  it('any state except OFF + ESTOP → CRITICAL (ESTOP) (sm.estop)', () => {
    for (const state of ['CALIBRATING', 'STARTING', 'NORMAL', 'WARNING', 'CRITICAL'] as const) {
      const f = inState(state);
      expect(transition(f, ESTOP, CONFIG)).toMatchObject({ map: 'sm.estop', to: 'CRITICAL' });
      expect(f).toMatchObject({ tripReason: 'ESTOP', gpio26: GPIO_HIGH });
    }
    const off = createFsm();
    expect(transition(off, ESTOP, CONFIG).map).toBeNull();
    expect(off.state).toBe('OFF');
  });

  it('CRITICAL + RESET with rpm < resetMaxRpm → OFF, trip, flags and counters cleared (sm.reset.ok)', () => {
    const f = inState('CRITICAL');
    Object.assign(f, { rpm: FW.resetMaxRpm - 1, alertRun: 4, clearRun: 1, warnReason: 'RCF', linkLost: true });
    expect(transition(f, RESET, CONFIG)).toMatchObject({ map: 'sm.reset.ok', to: 'OFF', events: ['RESET'] });
    expect(f).toMatchObject({ tripReason: null, warnReason: null, alertRun: 0, clearRun: 0, linkLost: false });
  });

  it('CRITICAL + START → refused, logged "ERR start refused: latched" (sm.start.refused)', () => {
    const f = inState('CRITICAL');
    const out = transition(f, START, CONFIG);
    expect(out).toMatchObject({ map: 'sm.start.refused', to: null, events: ['REFUSED'] });
    expect(out.log).toEqual([{ level: 'ERR', text: 'start refused: latched' }]);
    expect(f.state).toBe('CRITICAL');
  });

  it('CRITICAL + RESET with rpm ≥ resetMaxRpm → refused, "WARN reset refused: fan still turning" (sm.reset.refused)', () => {
    const f = inState('CRITICAL');
    f.rpm = FW.resetMaxRpm;
    const out = transition(f, RESET, CONFIG);
    expect(out).toMatchObject({ map: 'sm.reset.refused', to: null, events: ['REFUSED'] });
    expect(out.log).toEqual([{ level: 'WARN', text: 'reset refused: fan still turning' }]);
  });
});

describe('state machine: behaviour checks (P3.4)', () => {
  it('drives GPIO26 LOW exactly in STARTING, NORMAL and WARNING', () => {
    for (const state of ['OFF', 'CALIBRATING', 'STARTING', 'NORMAL', 'WARNING', 'CRITICAL'] as const) {
      const low = ['STARTING', 'NORMAL', 'WARNING'].includes(state);
      expect(inState(state).gpio26, state).toBe(low ? GPIO_LOW : GPIO_HIGH);
    }
  });

  it('four alerts then one non-alert do not trip; five consecutive alerts do', () => {
    const f = inState('NORMAL');
    for (let k = 0; k < 4; k++) transition(f, ALERT, CONFIG);
    transition(f, QUIET, CONFIG);
    expect(f).toMatchObject({ state: 'WARNING', alertRun: 0 });
    for (let k = 0; k < 4; k++) transition(f, ALERT, CONFIG);
    expect(f.state).toBe('WARNING');
    transition(f, ALERT, CONFIG);
    expect(f).toMatchObject({ state: 'CRITICAL', tripReason: 'RCF' });
  });

  it('a dropped verdict does not reset alertRun (no trigger arrives, so nothing changes)', () => {
    const f = inState('NORMAL');
    transition(f, ALERT, CONFIG);
    transition(f, ALERT, CONFIG);
    // the next verdict is dropped by the link: the firmware never calls transition for it
    transition(f, ALERT, CONFIG);
    expect(f.alertRun).toBe(3);
  });

  it('ignores RCF verdicts while STARTING (and in OFF, CALIBRATING, CRITICAL)', () => {
    for (const state of ['OFF', 'CALIBRATING', 'STARTING', 'CRITICAL'] as const) {
      const f = inState(state);
      const out = transition(f, ALERT, CONFIG);
      expect(out.map).toBeNull();
      expect(f.state).toBe(state);
      expect(f.alertRun).toBe(0);
    }
  });

  it('ignores commands and limits that have no row in the current state', () => {
    const f = inState('NORMAL');
    expect(transition(f, START, CONFIG).map).toBeNull();
    expect(transition(f, RESET, CONFIG).map).toBeNull();
    const off = createFsm();
    expect(transition(off, { kind: 'trip', reason: 'T_MAX' }, CONFIG).map).toBeNull();
    expect(transition(inState('STARTING'), { kind: 'trip', reason: 'STALL' }, CONFIG).map).toBeNull();
  });

  it('records the last executed row as activeMap', () => {
    const f = inState('NORMAL');
    expect(f.activeMap).toBe('sm.start.done');
  });

  it('has a @map id on every row, each used once', () => {
    const maps = TRANSITIONS.map((r) => r.map);
    expect(new Set(maps).size).toBe(maps.length);
  });
});
