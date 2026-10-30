// Sim worker — P0.6 stub. P2.7 replaces the body with the paced plant + firmware loop (spec §10.2).
import type { MainToSim, RcfToSim, SimToMain, SimToRcf } from '../shared/messages.ts';
import { PROTOCOL_VERSION, type Packet } from '../shared/protocol.ts';

interface WorkerScope {
  postMessage(message: SimToMain, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<MainToSim>) => void) | null;
}

const scope = self as unknown as WorkerScope;
let wifi: MessagePort | null = null;
let seq = 0;

/** Placeholder window packet (fan off, all features zero) so the channel can be exercised before P3. */
function stubPacket(): Packet {
  const n = seq++;
  return {
    v: PROTOCOL_VERSION,
    kind: 'packet',
    seq: n,
    ts_ms: n * 1000,
    win_ms: 1000,
    a_rms_g: 0,
    cf: 0,
    i_rms_A: 0,
    t_C: null,
    dtdt_C_per_min: null,
    rpm: 0,
    state: 'OFF',
    relay_ch2: 'OFF',
    link_lost: false,
    sensor_fault: false,
    warn_reason: null,
    trip_reason: null,
  };
}

function connect(port: MessagePort): void {
  wifi = port;
  port.onmessage = (event: MessageEvent<RcfToSim>) => {
    if (event.data.type === 'verdict') scope.postMessage({ type: 'verdictIn', verdict: event.data.verdict });
  };
}

scope.onmessage = (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'ping':
      scope.postMessage({ type: 'pong', id: msg.id });
      break;
    case 'connect':
      connect(msg.port);
      break;
    case 'play': {
      const packet = stubPacket();
      wifi?.postMessage({ type: 'packet', packet } satisfies SimToRcf);
      scope.postMessage({ type: 'packet', packet });
      break;
    }
    default:
      break; // init, pause, speed, reset, faults, commands, scenarios and raw arrive with P2.7
  }
};
