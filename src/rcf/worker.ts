// RCF worker (spec §9, §10.2): a thin wrapper around the pure RCF service. Packets arrive over the "Wi-Fi"
// MessageChannel from the sim; every packet is answered with a verdict on the channel and a copy to main.
import { CONFIG } from '../shared/config.ts';
import type { MainToRcf, RcfToMain, RcfToSim, SimToRcf } from '../shared/messages.ts';
import { Packet } from '../shared/protocol.ts';
import { createRcfService, type StatusMsg } from './service.ts';

interface WorkerScope {
  postMessage(message: RcfToMain): void;
  onmessage: ((event: MessageEvent<MainToRcf>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const rcf = createRcfService(CONFIG);

function postStatus(s: StatusMsg): void {
  scope.postMessage({ type: 'modelStatus', ...s });
}

function connect(port: MessagePort): void {
  port.onmessage = (event: MessageEvent<SimToRcf>) => {
    const parsed = Packet.safeParse(event.data.packet);
    if (!parsed.success) return;
    const { verdict, status } = rcf.packet(parsed.data);
    port.postMessage({ type: 'verdict', verdict } satisfies RcfToSim);
    scope.postMessage({ type: 'verdict', verdict });
    if (status) postStatus(status);
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
      rcf.setThreshold(msg.x);
      break;
    case 'loadModel':
      postStatus(rcf.load(msg.json));
      break;
    case 'train':
      postStatus(rcf.train());
      break;
  }
};
postStatus(rcf.status());
