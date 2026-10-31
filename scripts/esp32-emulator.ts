// ESP32 emulator core for bridge-py/fake_esp32.py (P8.1): the real TS plant and firmware, paced against the wall
// clock. Packets, events and log lines go to stdout as JSON lines; verdicts and commands (and test-only fault
// injections) come in on stdin. The firmware is exactly the simulator's, so its state machine is the real one.
//
// node scripts/esp32-emulator.ts [--speed 10] [--seed N] [--fault imbalance_g=0.3@60] [--cold]
import { createInterface } from 'node:readline';
import { createFirmware } from '../src/firmware/firmware.ts';
import { CONFIG } from '../src/shared/config.ts';
import type { FaultKey, SimEvent } from '../src/shared/messages.ts';
import { Command, Verdict } from '../src/shared/protocol.ts';
import { createPlant, schedule, stepPlant } from '../src/sim/plant.ts';

const TICK_ms = 10;
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const all = (name: string) => process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1] ?? ''] : []));
const speed = Number(arg('speed') ?? '1');
const seed = Number(arg('seed') ?? CONFIG.seed);

const plant = createPlant(CONFIG, seed, { warmStart: !process.argv.includes('--cold') });
const out = (m: object) => process.stdout.write(`${JSON.stringify(m)}\n`);
const firmware = createFirmware({
  cfg: CONFIG,
  seed,
  uplink: (packet) => out({ type: 'packet', packet }),
  packetLoss: () => plant.faults.values.packetLoss,
});

// --fault key=value@t_s schedules a fault at sim time t_s (the emulated bench's "physical" faults).
for (const spec of all('fault')) {
  const m = /^(\w+)=([\w.]+)@([\d.]+)$/.exec(spec);
  if (!m) throw new Error(`bad --fault ${spec}`);
  const value = m[2] === 'true' ? true : m[2] === 'false' ? false : Number(m[2]);
  schedule(plant, { at_s: Number(m[3]), kind: 'fault', key: m[1] as FaultKey, value, ramp_s: 0 });
}

// Datagrams from the bridge: a verdict enters the firmware's link now; a command applies at the next step.
createInterface({ input: process.stdin }).on('line', (line) => {
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const v = Verdict.safeParse(msg);
  if (v.success) return firmware.receiveVerdict(v.data, plant.t_s);
  const c = Command.safeParse(msg);
  if (c.success) schedule(plant, { at_s: plant.t_s, kind: 'command', cmd: c.data.cmd });
});

let contact = plant.relay.contact;
let last_ms = performance.now();
let debt_s = 0;
setInterval(() => {
  const now_ms = performance.now();
  debt_s += ((now_ms - last_ms) / 1000) * speed;
  last_ms = now_ms;
  const events: SimEvent[] = [];
  while (debt_s >= plant.dt_s) {
    stepPlant(plant, firmware);
    debt_s -= plant.dt_s;
    if (plant.relay.contact !== contact) {
      contact = plant.relay.contact;
      events.push({ t_s: plant.t_s, type: contact === 'NO' ? 'RELAY_CLOSED' : 'RELAY_OPEN' });
    }
  }
  for (const e of [...plant.events.splice(0), ...firmware.drainEvents(), ...events].sort((a, b) => a.t_s - b.t_s)) out({ type: 'event', event: e }); // prettier-ignore
  for (const line of firmware.drainLogs()) out({ type: 'log', line });
}, TICK_ms);
out({ type: 'ready', t_s: 0, speed, seed });
