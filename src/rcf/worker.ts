// RCF worker — P0.6 stub. P4.4 replaces the body with model loading, training and scoring (spec §9, §10.2).
import { CONFIG } from '../shared/config.ts';
import type { MainToRcf, RcfToMain, RcfToSim, SimToRcf } from '../shared/messages.ts';
import { Packet, PROTOCOL_VERSION, type Verdict } from '../shared/protocol.ts';

interface WorkerScope {
  postMessage(message: RcfToMain): void;
  onmessage: ((event: MessageEvent<MainToRcf>) => void) | null;
}

const scope = self as unknown as WorkerScope;
let threshold: number = CONFIG.rcf.threshold;

/** Unscored verdict for a received packet: there is no model before P4. */
function stubVerdict(seqRef: number): Verdict {
  return {
    v: PROTOCOL_VERSION,
    kind: 'verdict',
    seq_ref: seqRef,
    score: null,
    threshold,
    alert: false,
    clear: false,
    dominant: null,
    z: null,
    model: 'UNTRAINED',
  };
}

function connect(port: MessagePort): void {
  port.onmessage = (event: MessageEvent<SimToRcf>) => {
    const parsed = Packet.safeParse(event.data.packet);
    if (!parsed.success) return;
    const verdict = stubVerdict(parsed.data.seq);
    port.postMessage({ type: 'verdict', verdict } satisfies RcfToSim);
    scope.postMessage({ type: 'verdict', verdict });
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
    case 'setThreshold':
      threshold = msg.x;
      break;
    case 'loadModel':
    case 'train':
      scope.postMessage({ type: 'modelStatus', status: 'UNTRAINED', progress: 0, reason: 'RCF arrives in P4.4' });
      break;
  }
};
