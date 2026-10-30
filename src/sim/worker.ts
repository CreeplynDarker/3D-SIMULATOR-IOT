// Sim worker (spec §10.2): a thin wrapper that paces the pure plant against the wall clock and talks to main and to
// the RCF worker. Until P3.6 the firmware is a stand-in (see `standInFirmware`); the plant itself is final.
import { CONFIG } from '../shared/config.ts';
import type { MainToSim, RcfToSim, SimToMain, SimToRcf } from '../shared/messages.ts';
import { type Command, PROTOCOL_VERSION, type Packet } from '../shared/protocol.ts';
import {
  type Controller,
  createPlant,
  type Plant,
  schedule,
  type SensorsView,
  stepPlant,
  toSnapshot,
} from './plant.ts';
import { GPIO_HIGH, GPIO_LOW, type GpioLevel, type SimConfig } from './types.ts';

interface WorkerScope {
  postMessage(message: SimToMain, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<MainToSim>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const TICK_ms = 4; // §10.2 pacing: one wall tick every 4 ms
const MAX_SIM_PER_TICK_s = 0.2; // §10.2: never run more than 0.2 s of sim time per tick

let init: { config: SimConfig; seed: number; warmStart: boolean } = {
  config: CONFIG,
  seed: CONFIG.seed,
  warmStart: CONFIG.thermal.warmStart,
};
let plant: Plant = createPlant(init.config, init.seed, init);
let playing = false;
let speed = 1;
let lagging = false;
let debt_s = 0; // sim time owed to the wall clock, carried between ticks so the clock does not drift
let lastTick_ms = performance.now();
let lastSnapshot_ms = -Infinity;
let wifi: MessagePort | null = null;
let rawOn = false;
let raw: number[][] = [[], [], []];
let packetSeq = 0;

/**
 * Stand-in firmware until P3.6: START drives GPIO26 LOW (fan on), RESET and ESTOP drive it HIGH. It also collects raw
 * MPU samples for `raw{on}`. Everything else (states, limits, packets) arrives with the firmware mirror.
 */
function standInFirmware(): Controller {
  let gpio26: GpioLevel = GPIO_HIGH;
  return {
    tick(view: SensorsView): GpioLevel {
      if (rawOn) for (let k = 0; k < 3; k++) raw[k]?.push(view.accel_g[k] as number);
      return gpio26;
    },
    command(cmd: Command['cmd']) {
      gpio26 = cmd === 'START' ? GPIO_LOW : GPIO_HIGH;
    },
  };
}
let firmware = standInFirmware();

/** Zero placeholder packet once per sim second so the Wi-Fi channel carries traffic before P3.6 (D-015, D-032). */
function placeholderPacket(): Packet {
  const seq = packetSeq++;
  const win_ms = CONFIG.firmware.window_s * 1000;
  return {
    v: PROTOCOL_VERSION,
    kind: 'packet',
    seq,
    ts_ms: Math.round(plant.t_s * 1000),
    win_ms,
    a_rms_g: 0,
    cf: 0,
    i_rms_A: 0,
    t_C: null,
    dtdt_C_per_min: null,
    rpm: 0,
    state: 'OFF',
    relay_ch2: plant.relay.contact === 'NO' ? 'ON' : 'OFF',
    link_lost: false,
    sensor_fault: false,
    warn_reason: null,
    trip_reason: null,
  };
}

function postSnapshot(now_ms: number): void {
  lastSnapshot_ms = now_ms;
  scope.postMessage({ type: 'snapshot', snapshot: toSnapshot(plant, undefined, lagging) });
  if (rawOn && (raw[0]?.length ?? 0) > 0) {
    const [ax, ay, az] = raw.map((a) => Float32Array.from(a)) as [Float32Array, Float32Array, Float32Array];
    raw = [[], [], []];
    scope.postMessage({ type: 'raw', ax, ay, az }, [ax.buffer, ay.buffer, az.buffer]);
  }
}

/** Runs the sim steps owed for this wall tick, then forwards events and (at most snapshotHz) a snapshot. */
function tick(): void {
  const now_ms = performance.now();
  const wall_s = (now_ms - lastTick_ms) / 1000;
  lastTick_ms = now_ms;
  if (!playing) return;
  debt_s += wall_s * speed;
  lagging = debt_s > MAX_SIM_PER_TICK_s;
  if (lagging) debt_s = MAX_SIM_PER_TICK_s;
  const window_s = CONFIG.firmware.window_s;
  while (debt_s >= plant.dt_s) {
    const window0 = Math.floor(plant.t_s / window_s + 1e-9);
    stepPlant(plant, firmware);
    debt_s -= plant.dt_s;
    if (Math.floor(plant.t_s / window_s + 1e-9) > window0) {
      const packet = placeholderPacket();
      wifi?.postMessage({ type: 'packet', packet } satisfies SimToRcf);
      scope.postMessage({ type: 'packet', packet });
    }
  }
  for (const event of plant.events.splice(0)) scope.postMessage({ type: 'event', event });
  if (now_ms - lastSnapshot_ms >= 1000 / CONFIG.ui.snapshotHz) postSnapshot(now_ms);
}

function reset(): void {
  plant = createPlant(init.config, init.seed, init);
  firmware = standInFirmware();
  debt_s = 0;
  lagging = false;
  packetSeq = 0;
  raw = [[], [], []];
  postSnapshot(performance.now());
}

function connect(port: MessagePort): void {
  wifi = port;
  port.onmessage = (event: MessageEvent<RcfToSim>) => {
    if (event.data.type === 'verdict') scope.postMessage({ type: 'verdictIn', verdict: event.data.verdict });
  };
}

/** Faults and commands apply at the start of the next plant step. */
function handle(msg: MainToSim): void {
  const at_s = plant.t_s;
  switch (msg.type) {
    case 'init':
      init = { config: msg.config, seed: msg.seed, warmStart: msg.warmStart };
      return reset();
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
      scope.postMessage({ type: 'log', line: `scenario ${msg.id}: guided scenarios arrive in P4.5/P6.6` });
      return;
    case 'raw':
      rawOn = msg.on;
      raw = [[], [], []];
      return;
    case 'ping':
      scope.postMessage({ type: 'pong', id: msg.id });
      return;
  }
}

scope.onmessage = (event) => handle(event.data);
setInterval(tick, TICK_ms);
postSnapshot(performance.now());
