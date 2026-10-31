import { useEffect } from 'react';
import { BenchViewport } from './scene/Bench.tsx';
import { CONFIG } from './shared/config.ts';
import type { MainToRcf, MainToSim, ModelStatus, RcfToMain, SimToMain, Snapshot } from './shared/messages.ts';
import type { Command, Packet, Verdict } from './shared/protocol.ts';
import { appStore } from './store/index.ts';
import type { Speed } from './store/slices/sim.ts';
import { actions, bindWorkers } from './ui/actions.ts';
import { inspectStore, type StoreView } from './ui/debug.ts';
import { AppShell } from './ui/layout/AppShell.tsx';
import { ViewportControls } from './ui/ViewportControls.tsx';

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
  /** Plain-data view of the store. */
  inspect(): StoreView;
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
    play: actions.play,
    pause: actions.pause,
    setSpeed: (x: Speed) => actions.setSpeed(x),
    command: (cmd: Command['cmd']) => actions.command(cmd),
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
    inspect: () => inspectStore(appStore.getState()),
  };
  return () => {
    delete window.__pdm;
  };
}

/** Placeholder for a module that a later P5 task fills in. */
function Pending({ name }: { name: string }) {
  return <p className="p-3 text-xs text-slate-500">{name}</p>;
}

/** Root component: starts the workers, routes their output into the store and lays out the modules. */
export function App() {
  useEffect(() => {
    const workers = startWorkers();
    bindWorkers(workers);
    routeToStore(workers);
    const debug = new URLSearchParams(window.location.search).get('debug') === '1';
    const removeDebugApi = debug ? installDebugApi(workers) : () => undefined;
    return () => {
      removeDebugApi();
      bindWorkers(null);
      workers.dispose();
    };
  }, []);

  return (
    <AppShell
      topBar={<span className="text-sm font-semibold">IoT predictive maintenance · Grupo 7</span>}
      left={<Pending name="M4 faults · M5 operator" />}
      viewport={
        <>
          <BenchViewport />
          <ViewportControls />
        </>
      }
      right={<Pending name="M3 status · M9 inspector" />}
      dock={{
        charts: <Pending name="M6 charts" />,
        console: <Pending name="M7 console" />,
        code: <Pending name="M8 code panel (P6.5)" />,
        testlog: <Pending name="M10 test log" />,
      }}
    />
  );
}
