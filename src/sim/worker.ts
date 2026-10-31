// Sim worker (spec §10.2): a thin wrapper that paces the pure plant + firmware against the wall clock and talks to
// main and, over the "Wi-Fi" MessageChannel, to the RCF worker.
import { createFirmware, type Firmware } from '../firmware/firmware.ts';
import { CONFIG } from '../shared/config.ts';
import type { MainToSim, RcfToSim, SimEvent, SimToMain, SimToRcf } from '../shared/messages.ts';
import type { Packet } from '../shared/protocol.ts';
import { scenarioById, SCENARIOS } from '../shared/scenarios.ts';
import { type Controller, createPlant, type Plant, schedule, stepPlant, toSnapshot } from './plant.ts';
import { scriptDone, scriptEvent, type ScriptRun, startScript } from './script.ts';
import type { SimConfig } from './types.ts';

interface WorkerScope {
  postMessage(message: SimToMain, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<MainToSim>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const TICK_ms = 4; // §10.2 pacing: one wall tick every 4 ms
const MAX_SIM_PER_TICK_s = 0.2; // §10.2: never run more than 0.2 s of sim time per tick

/** The firmware limits the operator may change while it runs (M5, D-048). */
type LiveFirmwareParams = { -readonly [K in 'nCritical' | 'iMax_A' | 'tMax_C']: SimConfig['firmware'][K] };

// The worker's own copy of the config: `params` edits its firmware limits in place, and the firmware reads them live.
let init: { config: SimConfig; seed: number; warmStart: boolean } = {
  config: structuredClone(CONFIG),
  seed: CONFIG.seed,
  warmStart: CONFIG.thermal.warmStart,
};
let plant: Plant;
let firmware: Firmware;
let controller: Controller;
let lastContact: 'NC' | 'NO' = 'NC';
let playing = false;
let speed = 1;
let lagging = false;
let debt_s = 0; // sim time owed to the wall clock, carried between ticks so the clock does not drift
let lastTick_ms = performance.now();
let lastSnapshot_ms = -Infinity;
let wifi: MessagePort | null = null;
let rawOn = false;
let raw: number[][] = [[], [], []];
let script: ScriptRun | null = null;

/** Uplink: a packet that survived the link goes to the RCF worker, and a copy to main for the console and charts. */
function uplink(packet: Packet): void {
  wifi?.postMessage({ type: 'packet', packet } satisfies SimToRcf);
  scope.postMessage({ type: 'packet', packet });
}

/** Fresh plant and firmware from the last `init`. */
function build(): void {
  plant = createPlant(init.config, init.seed, init);
  const p = plant;
  firmware = createFirmware({
    cfg: init.config,
    seed: init.seed,
    uplink,
    packetLoss: () => p.faults.values.packetLoss,
  });
  const fw = firmware;
  // The firmware is the controller; this wrapper only taps the 1 kHz MPU samples for `raw{on}`.
  controller = {
    tick(view) {
      if (rawOn) for (let k = 0; k < 3; k++) raw[k]?.push(view.accel_g[k] as number);
      return fw.tick(view);
    },
    command: (cmd, t_s) => fw.command(cmd, t_s),
    afterStep: (t_s) => fw.afterStep(t_s),
  };
  lastContact = plant.relay.contact;
}

function postSnapshot(now_ms: number): void {
  lastSnapshot_ms = now_ms;
  scope.postMessage({ type: 'snapshot', snapshot: toSnapshot(plant, firmware.view(), lagging) });
  if (rawOn && (raw[0]?.length ?? 0) > 0) {
    const [ax, ay, az] = raw.map((a) => Float32Array.from(a)) as [Float32Array, Float32Array, Float32Array];
    raw = [[], [], []];
    scope.postMessage({ type: 'raw', ax, ay, az }, [ax.buffer, ay.buffer, az.buffer]);
  }
}

/** Forwards plant and firmware events (a running script sees them first) and the firmware's log lines. */
function flush(): void {
  for (const event of plant.events.splice(0)) scope.postMessage({ type: 'event', event });
  for (const event of firmware.drainEvents()) {
    if (script) scriptEvent(script, plant, event);
    scope.postMessage({ type: 'event', event });
  }
  for (const line of firmware.drainLogs()) scope.postMessage({ type: 'log', line });
}

/** Runs the sim steps owed for this wall tick, then forwards output and (at most snapshotHz) a snapshot. */
function tick(): void {
  const now_ms = performance.now();
  const wall_s = (now_ms - lastTick_ms) / 1000;
  lastTick_ms = now_ms;
  if (!playing) return;
  debt_s += wall_s * speed;
  lagging = debt_s > MAX_SIM_PER_TICK_s;
  if (lagging) debt_s = MAX_SIM_PER_TICK_s;
  while (debt_s >= plant.dt_s) {
    stepPlant(plant, controller);
    debt_s -= plant.dt_s;
    if (plant.relay.contact !== lastContact) {
      lastContact = plant.relay.contact;
      const type = lastContact === 'NO' ? 'RELAY_CLOSED' : 'RELAY_OPEN';
      scope.postMessage({ type: 'event', event: { t_s: plant.t_s, type } satisfies SimEvent });
    }
    if (script && scriptDone(script, plant.t_s)) {
      endScript();
      break;
    }
  }
  flush();
  if (now_ms - lastSnapshot_ms >= 1000 / CONFIG.ui.snapshotHz) postSnapshot(now_ms);
}

/** A script reached its end: the sim pauses there (§12 end times). */
function endScript(): void {
  if (!script) return;
  playing = false;
  debt_s = 0;
  scope.postMessage({ type: 'scenario', id: script.scenario.id, done: true });
  script = null;
  postSnapshot(performance.now());
}

/** Plays a §12 script from the current sim time (D-046); unknown ids are logged and ignored. */
function playScenario(id: string): void {
  if (!SCENARIOS.some((s) => s.id === id)) {
    scope.postMessage({ type: 'log', line: `WARN sim: unknown scenario ${id}` });
    return;
  }
  script = startScript(plant, scenarioById(id), plant.t_s);
  scope.postMessage({ type: 'scenario', id, done: false });
}

function reset(): void {
  script = null;
  build();
  debt_s = 0;
  lagging = false;
  raw = [[], [], []];
  postSnapshot(performance.now());
}

function connect(port: MessagePort): void {
  wifi = port;
  port.onmessage = (event: MessageEvent<RcfToSim>) => {
    if (event.data.type !== 'verdict') return;
    firmware.receiveVerdict(event.data.verdict, plant.t_s);
    scope.postMessage({ type: 'verdictIn', verdict: event.data.verdict });
  };
}

/** Faults and commands apply at the start of the next plant step. */
function handle(msg: MainToSim): void {
  const at_s = plant.t_s;
  switch (msg.type) {
    case 'init':
      init = { config: structuredClone(msg.config), seed: msg.seed, warmStart: msg.warmStart };
      return reset();
    case 'params': {
      const fw = init.config.firmware as LiveFirmwareParams;
      fw.nCritical = msg.nCritical;
      fw.iMax_A = msg.iMax_A;
      fw.tMax_C = msg.tMax_C;
      return postSnapshot(performance.now());
    }
    case 'connect':
      return connect(msg.port);
    case 'play':
      lastTick_ms = performance.now();
      playing = true;
      return;
    case 'pause':
      playing = false;
      return postSnapshot(performance.now());
    case 'speed':
      speed = msg.x;
      return;
    case 'reset':
      return reset();
    case 'fault':
      return schedule(plant, { at_s, kind: 'fault', key: msg.key, value: msg.value, ramp_s: msg.ramp_s });
    case 'clearFaults':
      return schedule(plant, { at_s, kind: 'clearFaults' });
    case 'command':
      return schedule(plant, { at_s, kind: 'command', cmd: msg.command.cmd });
    case 'scenario':
      return playScenario(msg.id);
    case 'raw':
      rawOn = msg.on;
      raw = [[], [], []];
      return;
    case 'ping':
      scope.postMessage({ type: 'pong', id: msg.id });
      return;
  }
}

build();
scope.onmessage = (event) => handle(event.data);
setInterval(tick, TICK_ms);
postSnapshot(performance.now());
