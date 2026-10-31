// Operator actions: the only place UI components send worker messages (AGENTS.md rule 6). Each one posts to a
// worker and records what the UI must remember in the store; none computes physics, features or scores.
import type { MainToRcf, MainToSim } from '../shared/messages.ts';
import { type Command, PROTOCOL_VERSION } from '../shared/protocol.ts';
import { scenarioById } from '../shared/scenarios.ts';
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
    toSim({ type: 'reset' });
    const s = appStore.getState();
    s.series.clear();
    s.sim.setScenario(null);
  },
  /** Plays a §12 script from a fresh sim at t = 0, at its own speed if it has one (S9). */
  playScenario(id: string) {
    const scenario = scenarioById(id);
    actions.resetSim();
    toSim({ type: 'scenario', id });
    appStore.getState().sim.setScenario({ id, done: false });
    if (scenario.speed !== undefined) actions.setSpeed(scenario.speed as Speed);
    actions.play();
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
