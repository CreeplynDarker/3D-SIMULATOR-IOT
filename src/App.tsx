import { useEffect } from 'react';
import { BenchViewport } from './scene/Bench.tsx';
import { CONFIG } from './shared/config.ts';
import type { MainToRcf, MainToSim, ModelStatus, RcfToMain, SimToMain, Snapshot } from './shared/messages.ts';
import { type Command, type Packet, PROTOCOL_VERSION, type Verdict } from './shared/protocol.ts';
import { appStore } from './store/index.ts';
import type { Speed } from './store/slices/sim.ts';

type WorkerTarget = 'sim' | 'rcf';

/** Relative to the page, so the build works from any static path (`base: './'`). */
const DEFAULT_MODEL_URL = './models/default-model.json';

/** Debug hooks used by the e2e tests (window.__pdm, only with `?debug=1`); not part of the UI. Times are in ms. */
export interface DebugApi {
  ping(target: WorkerTarget): Promise<number>;
  play(): void;
  pause(): void;
  setSpeed(x: Speed): void;
  command(cmd: Command['cmd']): void;
  snapshot(): Snapshot | null;
  simPackets(): Packet[];
  simVerdictsIn(): Verdict[];
  rcfVerdicts(): Verdict[];
  /** Wall time from each packet reaching main to its verdict reaching main, 0 if the verdict came first (ms). */
  verdictLatencies_ms(): number[];
  modelStatus(): { status: ModelStatus; progress: number; reason: string | null };
  train(): void;
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

/** Fetches the default model shipped in `public/models/` (spec §9.4) and hands it to the RCF worker. */
function loadDefaultModel(postRcf: (message: MainToRcf) => void): void {
  fetch(DEFAULT_MODEL_URL)
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((json) => postRcf({ type: 'loadModel', json }))
    .catch((err: unknown) => {
      const reason = `default model not loaded: ${(err as Error).message}`;
      appStore.getState().model.setStatus('UNTRAINED', 0, reason);
    });
}

/** Starts both workers, joins them with the "Wi-Fi" MessageChannel and initialises the sim (spec §10.2). */
function startWorkers(): Workers {
  const sim = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module', name: 'sim' });
  const rcf = new Worker(new URL('./rcf/worker.ts', import.meta.url), { type: 'module', name: 'rcf' });
  const postSim = (message: MainToSim, transfer: Transferable[] = []) => sim.postMessage(message, transfer);
  const postRcf = (message: MainToRcf, transfer: Transferable[] = []) => rcf.postMessage(message, transfer);
  const wifi = new MessageChannel();
  postSim({ type: 'connect', port: wifi.port1 }, [wifi.port1]);
  postRcf({ type: 'connect', port: wifi.port2 }, [wifi.port2]);
  postSim({ type: 'init', config: CONFIG, seed: CONFIG.seed, warmStart: CONFIG.thermal.warmStart });
  loadDefaultModel(postRcf);
  const dispose = () => {
    sim.terminate();
    rcf.terminate();
  };
  return { sim, rcf, postSim, postRcf, dispose };
}

/** Copies worker output into the store; components only read the store (AGENTS.md rule 6). */
function routeToStore(workers: Workers): void {
  workers.sim.addEventListener('message', (event: MessageEvent<SimToMain>) => {
    const msg = event.data;
    const s = appStore.getState();
    if (msg.type === 'snapshot') s.sim.setSnapshot(msg.snapshot);
    else if (msg.type === 'packet') s.series.pushPacket(msg.packet);
    else if (msg.type === 'event') s.series.pushEvent(msg.event);
    else if (msg.type === 'log') s.console.append({ kind: 'log', text: msg.line });
  });
  workers.rcf.addEventListener('message', (event: MessageEvent<RcfToMain>) => {
    const msg = event.data;
    const s = appStore.getState();
    if (msg.type === 'verdict') {
      s.model.setLastVerdict(msg.verdict);
      s.series.pushVerdict(msg.verdict);
    } else if (msg.type === 'modelStatus') {
      s.model.setStatus(msg.status, msg.progress, msg.reason);
      // §9.3: an aborted or rejected training is logged as a warning.
      if (msg.status === 'UNTRAINED' && msg.reason) s.console.append({ kind: 'log', text: `WARN rcf: ${msg.reason}` });
    }
  });
}

/** Sim controls shared by the debug API (and, in P5, the top bar and operator panel). */
function simControls(workers: Workers) {
  let seq = 0;
  return {
    play: () => {
      workers.postSim({ type: 'play' });
      appStore.getState().sim.setPlaying(true);
    },
    pause: () => {
      workers.postSim({ type: 'pause' });
      appStore.getState().sim.setPlaying(false);
    },
    setSpeed: (x: Speed) => {
      workers.postSim({ type: 'speed', x });
      appStore.getState().sim.setSpeed(x);
    },
    command: (cmd: Command['cmd']) =>
      workers.postSim({ type: 'command', command: { v: PROTOCOL_VERSION, kind: 'command', seq: seq++, cmd } }),
  };
}

/** Exposes `window.__pdm` for the e2e tests; returns a function that removes it. */
function installDebugApi(workers: Workers): () => void {
  const pending = new Map<number, { t0_ms: number; resolve: (rtt_ms: number) => void }>();
  let nextId = 0;
  const simPackets: Packet[] = [];
  const simVerdictsIn: Verdict[] = [];
  const rcfVerdicts: Verdict[] = [];
  // Packet copy (from the sim) and verdict (from the RCF) reach main on different queues, in either order.
  const firstAt_ms = new Map<number, { kind: 'packet' | 'verdict'; t_ms: number }>();
  const latencies_ms: number[] = [];
  const pair = (seq: number, kind: 'packet' | 'verdict') => {
    const now_ms = performance.now();
    const first = firstAt_ms.get(seq);
    if (first === undefined || first.kind === kind) return void firstAt_ms.set(seq, { kind, t_ms: now_ms });
    firstAt_ms.delete(seq);
    latencies_ms.push(kind === 'verdict' ? now_ms - first.t_ms : 0);
  };

  const onPong = (id: number) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    entry.resolve(performance.now() - entry.t0_ms);
  };
  workers.sim.addEventListener('message', (event: MessageEvent<SimToMain>) => {
    const msg = event.data;
    if (msg.type === 'pong') onPong(msg.id);
    else if (msg.type === 'packet') {
      simPackets.push(msg.packet);
      pair(msg.packet.seq, 'packet');
    } else if (msg.type === 'verdictIn') simVerdictsIn.push(msg.verdict);
  });
  workers.rcf.addEventListener('message', (event: MessageEvent<RcfToMain>) => {
    const msg = event.data;
    if (msg.type === 'pong') onPong(msg.id);
    else if (msg.type === 'verdict') {
      rcfVerdicts.push(msg.verdict);
      pair(msg.verdict.seq_ref, 'verdict');
    }
  });

  window.__pdm = {
    ping: (target) =>
      new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, { t0_ms: performance.now(), resolve });
        if (target === 'sim') workers.postSim({ type: 'ping', id });
        else workers.postRcf({ type: 'ping', id });
      }),
    ...simControls(workers),
    snapshot: () => appStore.getState().sim.snapshot,
    simPackets: () => [...simPackets],
    simVerdictsIn: () => [...simVerdictsIn],
    rcfVerdicts: () => [...rcfVerdicts],
    verdictLatencies_ms: () => [...latencies_ms],
    modelStatus: () => {
      const { status, progress, reason } = appStore.getState().model;
      return { status, progress, reason };
    },
    train: () => workers.postRcf({ type: 'train' }),
  };
  return () => {
    delete window.__pdm;
  };
}

/** Root component: the 3D bench for now; the shell and the other modules arrive in P5. */
export function App() {
  useEffect(() => {
    const workers = startWorkers();
    routeToStore(workers);
    const debug = new URLSearchParams(window.location.search).get('debug') === '1';
    const removeDebugApi = debug ? installDebugApi(workers) : () => undefined;
    return () => {
      removeDebugApi();
      workers.dispose();
    };
  }, []);

  return (
    <main className="h-screen w-screen bg-slate-950 text-slate-100">
      <BenchViewport />
    </main>
  );
}
