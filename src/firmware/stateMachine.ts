// State machine (spec §7.4): the transition table as data, applied by one function. The first matching row wins.
import type { SimEventType } from '../shared/messages.ts';
import type { State, TripReason, WarnReason } from '../shared/protocol.ts';
import { GPIO_HIGH, GPIO_LOW, type GpioLevel, type SimConfig } from '../sim/types.ts';
import type { SoftLimit, TripLimit } from './limits.ts';

export type Trigger =
  | { kind: 'cmd'; cmd: 'START' | 'RESET' | 'ESTOP' }
  | { kind: 'calibDone' }
  | { kind: 'graceDone' }
  | { kind: 'verdict'; alert: boolean; clear: boolean }
  | { kind: 'trip'; reason: TripLimit }
  | { kind: 'soft'; reason: SoftLimit };

export interface Fsm {
  state: State;
  gpio26: GpioLevel;
  /** Consecutive received verdicts with alert = true. */
  alertRun: number;
  /** Consecutive received verdicts with clear = true while no soft or sensor condition holds. */
  clearRun: number;
  tripReason: TripReason | null;
  warnReason: WarnReason | null;
  /** Inputs the guards read, kept current by the firmware. */
  linkLost: boolean;
  softActive: boolean;
  rpm: number;
  /** Last row executed (its `@map` id), for M8. */
  activeMap: string | null;
}

export interface LogEntry {
  level: 'INFO' | 'WARN' | 'ERR';
  text: string;
}

export interface Outcome {
  /** `@map` id of the row that fired, or null if no row matched. */
  map: string | null;
  from: State;
  /** New state, or null if the state did not change. */
  to: State | null;
  events: SimEventType[];
  log: LogEntry[];
}

interface Row {
  map: string;
  from: readonly State[];
  on: (t: Trigger) => boolean;
  guard?: (f: Fsm, cfg: SimConfig) => boolean;
  to: State | null;
  /** Side effects on the machine; returns the events and log lines to emit. */
  act: (f: Fsm, t: Trigger) => Pick<Outcome, 'events' | 'log'>;
}

const RUN_STATES: readonly State[] = ['STARTING', 'NORMAL', 'WARNING'];
const ALL_BUT_OFF: readonly State[] = ['CALIBRATING', 'STARTING', 'NORMAL', 'WARNING', 'CRITICAL'];

const isCmd = (cmd: 'START' | 'RESET' | 'ESTOP') => (t: Trigger) => t.kind === 'cmd' && t.cmd === cmd;
const isTrip = (reason: TripLimit) => (t: Trigger) => t.kind === 'trip' && t.reason === reason;
const isAlert = (t: Trigger) => t.kind === 'verdict' && t.alert;
const isClear = (t: Trigger) => t.kind === 'verdict' && t.clear;

function relayOn(f: Fsm): void {
  f.gpio26 = GPIO_LOW; // @map relay.on
}

function relayOff(f: Fsm): void {
  f.gpio26 = GPIO_HIGH; // @map relay.off
}

function resetCounters(f: Fsm): void {
  f.alertRun = 0;
  f.clearRun = 0;
}

/** Trip: GPIO26 HIGH in the same tick, trip_reason set, CRITICAL event, ERR log. */
function trip(f: Fsm, reason: TripReason): Pick<Outcome, 'events' | 'log'> {
  relayOff(f);
  f.tripReason = reason;
  return { events: ['CRITICAL'], log: [{ level: 'ERR', text: `trip ${reason}` }] };
}

const tripRow = (map: string, reason: TripLimit, from: readonly State[]): Row => ({
  map,
  from,
  on: isTrip(reason),
  to: 'CRITICAL',
  act: (f) => trip(f, reason),
});

export const TRANSITIONS: readonly Row[] = [
  { map: 'sm.off.start', from: ['OFF'], on: isCmd('START'), to: 'CALIBRATING', act: (f) => (resetCounters(f), { events: ['START'], log: [{ level: 'INFO', text: 'START: calibrating current zero' }] }) }, // @map sm.off.start
  { map: 'sm.calib.done', from: ['CALIBRATING'], on: (t) => t.kind === 'calibDone', to: 'STARTING', act: (f) => (relayOn(f), { events: ['CALIBRATED'], log: [] }) }, // @map sm.calib.done
  { map: 'sm.start.done', from: ['STARTING'], on: (t) => t.kind === 'graceDone', to: 'NORMAL', act: (f) => (resetCounters(f), { events: ['NORMAL'], log: [] }) }, // @map sm.start.done
  tripRow('sm.limit.imax', 'I_MAX', RUN_STATES), // @map sm.limit.imax
  tripRow('sm.limit.tmax', 'T_MAX', RUN_STATES), // @map sm.limit.tmax
  tripRow('sm.limit.stall', 'STALL', ['NORMAL', 'WARNING']), // @map sm.limit.stall
  { map: 'sm.estop', from: ALL_BUT_OFF, on: isCmd('ESTOP'), to: 'CRITICAL', act: (f) => trip(f, 'ESTOP') }, // @map sm.estop
  { map: 'sm.normal.alert', from: ['NORMAL'], on: isAlert, guard: (f) => !f.linkLost, to: 'WARNING', act: (f) => ((f.alertRun = 1), (f.warnReason = 'RCF'), { events: ['ALERT', 'WARNING'], log: [] }) }, // @map sm.normal.alert
  { map: 'sm.normal.soft', from: ['NORMAL'], on: (t) => t.kind === 'soft', to: 'WARNING', act: (f, t) => ((f.warnReason = t.kind === 'soft' ? t.reason : null), { events: ['WARNING'], log: [] }) }, // @map sm.normal.soft
  { map: 'sm.warn.trip', from: ['WARNING'], on: isAlert, guard: (f, cfg) => f.alertRun >= cfg.firmware.nCritical, to: 'CRITICAL', act: (f) => { const out = trip(f, 'RCF'); return { events: ['ALERT', ...out.events], log: out.log }; } }, // @map sm.warn.trip
  { map: 'sm.warn.alert', from: ['WARNING'], on: isAlert, to: null, act: () => ({ events: ['ALERT'], log: [] }) }, // @map sm.warn.alert
  { map: 'sm.warn.clear', from: ['WARNING'], on: isClear, guard: (f, cfg) => f.clearRun >= cfg.firmware.nClear, to: 'NORMAL', act: (f) => ((f.warnReason = null), { events: ['NORMAL'], log: [] }) }, // @map sm.warn.clear
  { map: 'sm.reset.ok', from: ['CRITICAL'], on: isCmd('RESET'), guard: (f, cfg) => f.rpm < cfg.firmware.resetMaxRpm, to: 'OFF', act: (f) => (resetCounters(f), (f.tripReason = null), (f.warnReason = null), (f.linkLost = false), (f.softActive = false), { events: ['RESET'], log: [] }) }, // @map sm.reset.ok
  { map: 'sm.reset.refused', from: ['CRITICAL'], on: isCmd('RESET'), to: null, act: () => ({ events: ['REFUSED'], log: [{ level: 'WARN', text: 'reset refused: fan still turning' }] }) }, // @map sm.reset.refused
  { map: 'sm.start.refused', from: ['CRITICAL'], on: isCmd('START'), to: null, act: () => ({ events: ['REFUSED'], log: [{ level: 'ERR', text: 'start refused: latched' }] }) }, // @map sm.start.refused
]; // prettier-ignore

/** Machine at boot: OFF, relay de-energised. */
export function createFsm(): Fsm {
  return {
    state: 'OFF',
    gpio26: GPIO_HIGH,
    alertRun: 0,
    clearRun: 0,
    tripReason: null,
    warnReason: null,
    linkLost: false,
    softActive: false,
    rpm: 0,
    activeMap: null,
  };
}

/** Verdict counters (§7.4), updated in NORMAL and WARNING only; RCF verdicts are ignored in other states. */
function countVerdict(f: Fsm, t: Trigger): void {
  if (t.kind !== 'verdict' || (f.state !== 'NORMAL' && f.state !== 'WARNING')) return;
  f.alertRun = t.alert ? f.alertRun + 1 : 0;
  f.clearRun = t.clear && !f.softActive ? f.clearRun + 1 : 0;
}

/** Applies one trigger: the first row whose state, trigger and guard match fires. Mutates `f`. */
export function transition(f: Fsm, t: Trigger, cfg: SimConfig): Outcome {
  const from = f.state;
  countVerdict(f, t);
  const row = TRANSITIONS.find((r) => r.from.includes(from) && r.on(t) && (r.guard?.(f, cfg) ?? true));
  if (!row) return { map: null, from, to: null, events: [], log: [] };
  const { events, log } = row.act(f, t);
  f.activeMap = row.map;
  if (row.to === null || row.to === from) return { map: row.map, from, to: row.to, events, log };
  f.state = row.to;
  const why = f.tripReason && row.to === 'CRITICAL' ? ` (${f.tripReason})` : f.warnReason && row.to === 'WARNING' ? ` (${f.warnReason})` : ''; // prettier-ignore
  return {
    map: row.map,
    from,
    to: row.to,
    events,
    log: [{ level: 'INFO', text: `${from} -> ${row.to}${why}` }, ...log],
  };
}
