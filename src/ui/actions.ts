// Operator actions: the only place UI components send worker messages (AGENTS.md rule 6). Each one posts to a
// worker and records what the UI must remember in the store; none computes physics, features or scores.
import type { FaultKey, MainToRcf, MainToSim } from '../shared/messages.ts';
import { type Command, PROTOCOL_VERSION } from '../shared/protocol.ts';
import { CONFIG } from '../shared/config.ts';
import { guidedFor } from '../shared/guided.ts';
import { scenarioById } from '../shared/scenarios.ts';
import type { SimConfig } from '../sim/types.ts';
import type { OperatorParams } from '../store/slices/ui.ts';
import { canReset } from './rules.ts';
import { conditionText } from './testlog.ts';
import { appStore } from '../store/index.ts';
import type { Speed } from '../store/slices/sim.ts';

export interface WorkerPorts {
  postSim(message: MainToSim, transfer?: Transferable[]): void;
  postRcf(message: MainToRcf, transfer?: Transferable[]): void;
}

let ports: WorkerPorts | null = null;
let commandSeq = 0;

/** Connects the actions to the running workers (App does this at start-up; null disconnects). */
export function bindWorkers(p: WorkerPorts | null): void {
  ports = p;
}

const toSim = (m: MainToSim) => ports?.postSim(m);
const toRcf = (m: MainToRcf) => ports?.postRcf(m);

/** §5.1 config with the operator's M5 limits and warm-start choice, for `init`. */
export function initConfig(op: OperatorParams): SimConfig {
  return {
    ...CONFIG,
    firmware: { ...CONFIG.firmware, nCritical: op.nCritical, iMax_A: op.iMax_A, tMax_C: op.tMax_C },
    thermal: { ...CONFIG.thermal, warmStart: op.warmStart },
  };
}

export const actions = {
  play() {
    toSim({ type: 'play' });
    appStore.getState().sim.setPlaying(true);
  },
  pause() {
    toSim({ type: 'pause' });
    appStore.getState().sim.setPlaying(false);
  },
  togglePlay() {
    if (appStore.getState().sim.playing) actions.pause();
    else actions.play();
  },
  setSpeed(x: Speed) {
    toSim({ type: 'speed', x });
    appStore.getState().sim.setSpeed(x);
  },
  /** Rebuilds plant and firmware at t = 0 (the sim keeps its play state); the charts start over. */
  resetSim() {
    const s = appStore.getState();
    const op = s.ui.operator;
    toSim({ type: 'init', config: initConfig(op), seed: CONFIG.seed, warmStart: op.warmStart });
    s.series.clear();
    s.console.clear(); // seq restarts at 0, so a new run starts a new console (D-050)
    s.model.clearVerdicts();
    s.sim.clearSnapshot(); // until the worker's fresh snapshot arrives, nothing reads the old run's time

    s.sim.setScenario(null);
    s.ui.resetFaultTargets();
  },
  /** Injects fault `key` (§6.9): numeric faults ramp over `ui.ramp.ramp_s` when the ramp is on. */
  setFault(key: FaultKey, value: number | boolean) {
    const ui = appStore.getState().ui;
    ui.setFaultTarget(key, value);
    const ramp_s = typeof value === 'number' && ui.ramp.on ? ui.ramp.ramp_s : 0;
    toSim({ type: 'fault', key, value, ramp_s });
  },
  clearFaults() {
    toSim({ type: 'clearFaults' });
    appStore.getState().ui.resetFaultTargets();
  },
  /**
   * Plays a §12 script from a fresh sim at t = 0. A guided scenario (M11) opens its card and runs at its guided
   * speed; otherwise the script's own speed applies if it has one (S9).
   */
  playScenario(id: string) {
    const scenario = scenarioById(id);
    const guided = guidedFor(id);
    actions.resetSim();
    toSim({ type: 'scenario', id });
    const s = appStore.getState();
    s.sim.setScenario({ id, done: false });
    s.ui.setGuided(guided ? { id, view: 0, reached: 0 } : null);
    s.ui.setGuidedChart(null);
    const speed = guided?.speed ?? scenario.speed;
    if (speed !== undefined) actions.setSpeed(speed as Speed);
    actions.play();
  },
  /** Shows guided step `i` (0-based): its camera preset, the charts tab and the strip to watch. */
  showGuidedStep(i: number) {
    const ui = appStore.getState().ui;
    const step = ui.guided && guidedFor(ui.guided.id)?.steps[i];
    if (!ui.guided || !step) return;
    ui.setGuided({ ...ui.guided, view: i });
    ui.setCamera(step.camera);
    ui.setGuidedChart(step.chart);
    ui.setDockTab('charts');
  },
  /** Closes the M11 card; the scenario keeps running. */
  exitGuided() {
    const ui = appStore.getState().ui;
    ui.setGuided(null);
    ui.setGuidedChart(null);
  },
  /** Alert threshold on the normalised score (unitless) for the RCF. */
  setThreshold(x: number) {
    toRcf({ type: 'setThreshold', x });
    appStore.getState().model.setThreshold(x);
  },
  /** M5 limits go to the running firmware at once; warm start waits for the next sim reset. */
  setOperator(p: Partial<OperatorParams>) {
    const ui = appStore.getState().ui;
    ui.setOperator(p);
    const { nCritical, iMax_A, tMax_C } = appStore.getState().ui.operator;
    if ('nCritical' in p || 'iMax_A' in p || 'tMax_C' in p) toSim({ type: 'params', nCritical, iMax_A, tMax_C });
  },
  train() {
    toRcf({ type: 'train' });
  },
  /** Opens the reset confirmation (only in CRITICAL, like `btn-reset`). */
  requestReset() {
    const s = appStore.getState();
    if (canReset(s.sim.snapshot?.state ?? 'OFF')) s.ui.setResetDialogOpen(true);
  },
  confirmReset() {
    actions.command('RESET');
    appStore.getState().ui.setResetDialogOpen(false);
  },
  /** Streams the raw 1 kHz MPU6050 samples from the sim (`tgl-raw-mpu`). */
  setRawMpu(on: boolean) {
    toSim({ type: 'raw', on });
    appStore.getState().sim.setRawOn(on);
  },
  /** Opens an M10 run now, named after the scenario being played or the faults injected. */
  startRun() {
    const s = appStore.getState();
    if (s.testlog.active !== null) return;
    s.testlog.startRun(conditionText(s.sim.scenario?.id ?? null, s.ui.faultTargets), s.sim.snapshot?.t_s ?? 0);
  },
  stopRun() {
    const s = appStore.getState();
    if (s.testlog.active !== null) s.testlog.stopRun(s.testlog.active, s.sim.snapshot?.t_s ?? 0);
  },
  /** Notes for the open run, or the last one if none is open. */
  setRunNotes(notes: string) {
    const t = appStore.getState().testlog;
    const id = t.active ?? t.runs.at(-1)?.id;
    if (id !== undefined) t.updateRun(id, { notes });
  },
  toggleTheme() {
    const ui = appStore.getState().ui;
    ui.setTheme(ui.theme === 'dark' ? 'light' : 'dark');
  },
  /** Operator command to the firmware (START, RESET, ESTOP), logged in the console. */
  command(cmd: Command['cmd']) {
    const command: Command = { v: PROTOCOL_VERSION, kind: 'command', seq: commandSeq++, cmd };
    toSim({ type: 'command', command });
    appStore.getState().console.append({ kind: 'command', text: `→ cmd ${cmd} #${command.seq}`, json: command });
  },
};
