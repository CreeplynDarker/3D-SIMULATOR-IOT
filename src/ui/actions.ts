// Operator actions: the only place UI components send worker messages (AGENTS.md rule 6). Each one posts to a
// worker and records what the UI must remember in the store; none computes physics, features or scores.
import type { MainToRcf, MainToSim } from '../shared/messages.ts';
import { type Command, PROTOCOL_VERSION } from '../shared/protocol.ts';
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
  /** Operator command to the firmware (START, RESET, ESTOP), logged in the console. */
  command(cmd: Command['cmd']) {
    const command: Command = { v: PROTOCOL_VERSION, kind: 'command', seq: commandSeq++, cmd };
    toSim({ type: 'command', command });
    appStore.getState().console.append({ kind: 'command', text: `→ cmd ${cmd} #${command.seq}`, json: command });
  },
};
