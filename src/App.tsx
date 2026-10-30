import { useEffect } from 'react';
import type { MainToRcf, MainToSim, RcfToMain, SimToMain } from './shared/messages.ts';
import type { Packet, Verdict } from './shared/protocol.ts';

type WorkerTarget = 'sim' | 'rcf';

/** Debug hooks used by the e2e tests (window.__pdm); not part of the UI. Round-trip times are in ms. */
export interface DebugApi {
  ping(target: WorkerTarget): Promise<number>;
  play(): void;
  simPackets(): Packet[];
  simVerdictsIn(): Verdict[];
  rcfVerdicts(): Verdict[];
}

declare global {
  interface Window {
    __pdm?: DebugApi;
  }
}

interface Workers {
  sim: Worker;
  rcf: Worker;
  postSim(message: MainToSim, transfer?: Transferable[]): void;
  postRcf(message: MainToRcf, transfer?: Transferable[]): void;
  dispose(): void;
}

/** Starts both workers and joins them with the "Wi-Fi" MessageChannel (spec §10.2). */
function startWorkers(): Workers {
  const sim = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module', name: 'sim' });
  const rcf = new Worker(new URL('./rcf/worker.ts', import.meta.url), { type: 'module', name: 'rcf' });
  const postSim = (message: MainToSim, transfer: Transferable[] = []) => sim.postMessage(message, transfer);
  const postRcf = (message: MainToRcf, transfer: Transferable[] = []) => rcf.postMessage(message, transfer);
  const wifi = new MessageChannel();
  postSim({ type: 'connect', port: wifi.port1 }, [wifi.port1]);
  postRcf({ type: 'connect', port: wifi.port2 }, [wifi.port2]);
  const dispose = () => {
    sim.terminate();
    rcf.terminate();
  };
  return { sim, rcf, postSim, postRcf, dispose };
}

/** Exposes `window.__pdm` for the e2e tests; returns a function that removes it. */
function installDebugApi(workers: Workers): () => void {
  const pending = new Map<number, { t0_ms: number; resolve: (rtt_ms: number) => void }>();
  let nextId = 0;
  const simPackets: Packet[] = [];
  const simVerdictsIn: Verdict[] = [];
  const rcfVerdicts: Verdict[] = [];

  const onPong = (id: number) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    entry.resolve(performance.now() - entry.t0_ms);
  };
  workers.sim.onmessage = (event: MessageEvent<SimToMain>) => {
    const msg = event.data;
    if (msg.type === 'pong') onPong(msg.id);
    else if (msg.type === 'packet') simPackets.push(msg.packet);
    else if (msg.type === 'verdictIn') simVerdictsIn.push(msg.verdict);
  };
  workers.rcf.onmessage = (event: MessageEvent<RcfToMain>) => {
    const msg = event.data;
    if (msg.type === 'pong') onPong(msg.id);
    else if (msg.type === 'verdict') rcfVerdicts.push(msg.verdict);
  };

  window.__pdm = {
    ping: (target) =>
      new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, { t0_ms: performance.now(), resolve });
        if (target === 'sim') workers.postSim({ type: 'ping', id });
        else workers.postRcf({ type: 'ping', id });
      }),
    play: () => workers.postSim({ type: 'play' }),
    simPackets: () => [...simPackets],
    simVerdictsIn: () => [...simVerdictsIn],
    rcfVerdicts: () => [...rcfVerdicts],
  };
  return () => {
    delete window.__pdm;
  };
}

/** Root component; the shell and modules arrive in P5. */
export function App() {
  useEffect(() => {
    const workers = startWorkers();
    const removeDebugApi = installDebugApi(workers);
    return () => {
      removeDebugApi();
      workers.dispose();
    };
  }, []);

  return (
    <main className="flex h-screen items-center justify-center bg-slate-950 text-slate-100">
      <h1 className="text-xl font-semibold">IoT Predictive-Maintenance Simulator</h1>
    </main>
  );
}
