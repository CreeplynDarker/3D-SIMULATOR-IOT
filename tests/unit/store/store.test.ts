import { beforeEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import type { Snapshot } from '../../../src/shared/messages.ts';
import { type Packet, PROTOCOL_VERSION, type Verdict } from '../../../src/shared/protocol.ts';
import { NO_TRAFFIC } from '../../../src/sim/plant.ts';
import { type AppStore, createAppStore } from '../../../src/store/index.ts';
import { CONSOLE_CAPACITY } from '../../../src/store/slices/console.ts';
import { SERIES_CAPACITY } from '../../../src/store/slices/series.ts';

const packet = (seq: number): Packet => ({
  v: PROTOCOL_VERSION,
  kind: 'packet',
  seq,
  ts_ms: seq * 1000,
  win_ms: 1000,
  a_rms_g: 0.03,
  cf: 2.5,
  i_rms_A: 0.18,
  t_C: 34,
  dtdt_C_per_min: 0,
  rpm: 3800,
  state: 'NORMAL',
  relay_ch2: 'ON',
  link_lost: false,
  sensor_fault: false,
  warn_reason: null,
  trip_reason: null,
});

const verdict = (seqRef: number, score: number): Verdict => ({
  v: PROTOCOL_VERSION,
  kind: 'verdict',
  seq_ref: seqRef,
  score,
  threshold: 0.5,
  alert: score >= 0.5,
  clear: score < 0.4,
  dominant: 'a_rms_g',
  z: null,
  model: 'READY',
});

const snapshot = (t_s: number, lagging: boolean): Snapshot => ({
  traffic: { ...NO_TRAFFIC },
  t_s,
  rpm: 3800,
  omega_radps: 397.9,
  theta_rad: 1,
  fanV_V: 12,
  current_A: 0.18,
  tMotor_C: 34,
  tProbe_C: 34,
  coilOn: true,
  contact: 'NO',
  gpio26: 0,
  state: 'NORMAL',
  faults: {
    imbalance_g: 0,
    looseness: 0,
    friction: 0,
    overheat: 0,
    supplySag_V: 0,
    packetLoss: 0,
    ds18b20Disconnect: false,
  },
  accel_g: [0, 0, 1],
  acsOut_V: 2.533,
  adcPin_V: 1.689,
  adcCounts: 1965,
  dsReading_C: 34,
  tachHigh: false,
  alertRun: 0,
  nCritical: 5,
  linkLost: false,
  sensorFault: false,
  tripReason: null,
  activeMap: null,
  lagging,
});

let store: AppStore;
beforeEach(() => {
  store = createAppStore();
});

describe('store capacities', () => {
  it('series holds 600 windows and the console holds consoleMaxLines', () => {
    expect(SERIES_CAPACITY).toBe(600);
    expect(CONSOLE_CAPACITY).toBe(CONFIG.ui.consoleMaxLines);
  });
});

describe('sim slice', () => {
  it('starts paused at 1× with no snapshot', () => {
    const { sim } = store.getState();
    expect(sim.snapshot).toBeNull();
    expect(sim.playing).toBe(false);
    expect(sim.speed).toBe(1);
    expect(sim.lagging).toBe(false);
  });

  it('stores snapshots, play state and speed', () => {
    store.getState().sim.setSnapshot(snapshot(12.5, true));
    store.getState().sim.setPlaying(true);
    store.getState().sim.setSpeed(10);
    const { sim } = store.getState();
    expect(sim.snapshot?.t_s).toBe(12.5);
    expect(sim.lagging).toBe(true);
    expect(sim.playing).toBe(true);
    expect(sim.speed).toBe(10);
  });
});

describe('series slice', () => {
  it('adds one row per packet and joins verdicts by seq', () => {
    const before = store.getState().series.rev;
    store.getState().series.pushPacket(packet(7));
    store.getState().series.pushVerdict(verdict(7, 0.61));
    const { series } = store.getState();
    expect(series.rev).toBe(before + 2);
    expect(series.windows.toArray()).toEqual([
      expect.objectContaining({ seq: 7, t_s: 7, a_rms_g: 0.03, rpm: 3800, state: 'NORMAL', score: 0.61, alert: true }),
    ]);
  });

  it('drops the oldest windows past 600', () => {
    for (let seq = 0; seq < SERIES_CAPACITY + 25; seq++) store.getState().series.pushPacket(packet(seq));
    const rows = store.getState().series.windows.toArray();
    expect(rows).toHaveLength(SERIES_CAPACITY);
    expect(rows[0]?.seq).toBe(25);
    expect(rows.at(-1)?.seq).toBe(SERIES_CAPACITY + 24);
  });

  it('records events and clears everything', () => {
    store.getState().series.pushEvent({ t_s: 60, type: 'FAULT_SET', detail: 'imbalance_g=0.3' });
    store.getState().series.pushPacket(packet(1));
    expect(store.getState().series.events.toArray()).toHaveLength(1);
    store.getState().series.clear();
    expect(store.getState().series.windows.size).toBe(0);
    expect(store.getState().series.events.size).toBe(0);
  });
});

describe('console slice', () => {
  it('appends entries, pauses and clears', () => {
    store.getState().console.append({ kind: 'log', text: '[t=000001.000] INFO fw: OFF -> CALIBRATING' });
    store.getState().console.setPaused(true);
    const { console: c } = store.getState();
    expect(c.lines.toArray()).toEqual([{ kind: 'log', text: '[t=000001.000] INFO fw: OFF -> CALIBRATING' }]);
    expect(c.paused).toBe(true);
    c.clear();
    expect(store.getState().console.lines.size).toBe(0);
  });

  it('drops the oldest lines past consoleMaxLines', () => {
    for (let i = 0; i < CONSOLE_CAPACITY + 3; i++) store.getState().console.append({ kind: 'log', text: `line ${i}` });
    const lines = store.getState().console.lines.toArray();
    expect(lines).toHaveLength(CONSOLE_CAPACITY);
    expect(lines[0]?.text).toBe('line 3');
  });
});

describe('model slice', () => {
  it('tracks status, threshold and the last verdict', () => {
    expect(store.getState().model.status).toBe('UNTRAINED');
    expect(store.getState().model.threshold).toBe(CONFIG.rcf.threshold);
    store.getState().model.setStatus('TRAINING', 0.25);
    expect(store.getState().model).toMatchObject({ status: 'TRAINING', progress: 0.25, reason: null });
    store.getState().model.setStatus('UNTRAINED', 0, 'holdout max too high');
    expect(store.getState().model.reason).toBe('holdout max too high');
    store.getState().model.setThreshold(0.45);
    store.getState().model.setLastVerdict(verdict(3, 0.2));
    expect(store.getState().model.threshold).toBe(0.45);
    expect(store.getState().model.lastVerdict?.seq_ref).toBe(3);
  });
});

describe('ui slice', () => {
  it('updates selection, camera, toggles, dock tab and theme', () => {
    const { ui } = store.getState();
    expect(ui.camera).toBe('overview');
    expect(ui.theme).toBe('dark');
    ui.select('fan');
    ui.setCamera('relay');
    ui.setToggle('heat', true);
    ui.setVibExaggeration(25);
    ui.setDockTab('console');
    ui.setTheme('light');
    expect(store.getState().ui).toMatchObject({
      selectedId: 'fan',
      camera: 'relay',
      dockTab: 'console',
      theme: 'light',
      vibExaggeration: 25,
    });
    expect(store.getState().ui.toggles.heat).toBe(true);
    store.getState().ui.select(null);
    expect(store.getState().ui.selectedId).toBeNull();
  });

  it('clamps vibration exaggeration to 1–50', () => {
    store.getState().ui.setVibExaggeration(500);
    expect(store.getState().ui.vibExaggeration).toBe(50);
    store.getState().ui.setVibExaggeration(0);
    expect(store.getState().ui.vibExaggeration).toBe(1);
  });
});

describe('testlog slice', () => {
  it('starts, updates and clears runs', () => {
    const id = store.getState().testlog.startRun('S2 imbalance', 0);
    store.getState().testlog.updateRun(id, { alerted: true, firstAlert_s: 62.0, notes: 'clean trip' });
    store.getState().testlog.stopRun(id, 120);
    const run = store.getState().testlog.runs[0];
    expect(run).toMatchObject({ id, scenario: 'S2 imbalance', start_s: 0, duration_s: 120, alerted: true });
    expect(run?.firstAlert_s).toBe(62.0);
    expect(run?.notes).toBe('clean trip');
    const second = store.getState().testlog.startRun('S1 baseline', 130);
    expect(second).not.toBe(id);
    store.getState().testlog.clear();
    expect(store.getState().testlog.runs).toEqual([]);
  });
});
