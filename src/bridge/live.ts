// Live mode (P8.2): packets from the board, through the bridge, feed the store and the browser's RCF worker; its
// verdicts and the operator's commands go back to the bridge. Replay (P8.3) feeds packets through the same path.
import type { MainToRcf, RcfToSim } from '../shared/messages.ts';
import type { Command, Packet, Verdict } from '../shared/protocol.ts';
import { appStore } from '../store/index.ts';
import { packetLine, verdictLine } from '../ui/consoleFormat.ts';
import { runPatch } from '../ui/testlog.ts';
import { liveSnapshot, packetEvents } from './liveSnapshot.ts';
import { bridgeUrl, connectLive } from './wsClient.ts';

export type PostRcf = (message: MainToRcf, transfer?: Transferable[]) => void;

/** What to do when Live can't reach a bridge (e.g. on the published Pages site, D-072). */
export const NO_BRIDGE =
  'Live mode needs the bridge on the laptop that talks to the board. Run it (see bridge-py/README.md: python bridge-py/app.py) and open http://localhost:8765.'; // prettier-ignore

export interface PacketPath {
  /** One packet into the store, the console, the events and the RCF worker. */
  ingest(packet: Packet): void;
  close(): void;
}

/**
 * The shared path for live and replayed packets. The RCF worker scores them on its own channel (as it does the
 * sim's), and each verdict comes back to `onVerdict`.
 */
export function createPacketPath(postRcf: PostRcf, onVerdict: (v: Verdict) => void): PacketPath {
  const channel = new MessageChannel();
  postRcf({ type: 'connect', port: channel.port2 }, [channel.port2]);
  const sentAt = new Map<number, number>(); // seq → the packet's sim time, for the verdict pulses
  let prev: Packet | null = null;
  channel.port1.onmessage = (e: MessageEvent<RcfToSim>) => {
    if (e.data.type !== 'verdict') return;
    const v = e.data.verdict;
    const s = appStore.getState();
    s.console.append({ kind: 'verdict', text: verdictLine(v), json: v });
    const snap = s.sim.snapshot;
    if (snap?.unknown) {
      const t_s = sentAt.get(v.seq_ref) ?? snap.t_s;
      s.sim.setLiveSnapshot({ ...snap, traffic: { ...snap.traffic, verdicts: snap.traffic.verdicts + 1, lastVerdict_s: t_s } }, s.sim.snapshotWall_ms); // prettier-ignore
    }
    sentAt.delete(v.seq_ref);
    onVerdict(v);
  };
  return {
    ingest(p) {
      const s = appStore.getState();
      s.series.pushPacket(p);
      s.console.append({ kind: 'packet', text: packetLine(p), json: p });
      for (const event of packetEvents(prev, p)) {
        s.series.pushEvent(event);
        const run = s.testlog.runs.find((r) => r.id === s.testlog.active);
        if (run) s.testlog.updateRun(run.id, runPatch(run, event));
      }
      const snap = s.sim.snapshot?.unknown ? s.sim.snapshot : null;
      s.sim.setLiveSnapshot(liveSnapshot(p, snap, { nCritical: s.ui.operator.nCritical }), performance.now());
      prev = p;
      sentAt.set(p.seq, p.ts_ms / 1000);
      channel.port1.postMessage({ type: 'packet', packet: p });
    },
    close: () => channel.port1.close(),
  };
}

export interface LiveSession {
  command(command: Command): void;
  stop(): void;
}

/** Connects to the bridge at this page's origin and runs the live loop until `stop`. */
export function startLive(postRcf: PostRcf, location: { protocol: string; host: string }): LiveSession {
  const s = () => appStore.getState();
  s().sim.setLive('connecting');
  let stopped = false;
  // eslint-disable-next-line prefer-const -- the path needs the link and the link needs the path
  let link: ReturnType<typeof connectLive>;
  const path = createPacketPath(postRcf, (verdict) => link.send({ type: 'verdict', verdict }));
  link = connectLive(bridgeUrl(location), {
    onOpen: () => s().sim.setLive('open'),
    onPacket: (p) => path.ingest(p),
    onClose: (everOpened) => {
      if (!stopped) s().sim.setLive('closed', everOpened ? 'The bridge closed the connection.' : NO_BRIDGE);
    },
  });
  return {
    command: (command) => link.send({ type: 'command', command }),
    stop: () => {
      stopped = true;
      link.close();
      path.close();
      s().sim.setLive('off');
    },
  };
}
