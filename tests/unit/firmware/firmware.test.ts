import { describe, expect, it } from 'vitest';
import { createFirmware, type Firmware } from '../../../src/firmware/firmware.ts';
import { formatLog } from '../../../src/firmware/logger.ts';
import { CONFIG } from '../../../src/shared/config.ts';
import type { SimEvent } from '../../../src/shared/messages.ts';
import { Packet, PROTOCOL_VERSION, type Verdict } from '../../../src/shared/protocol.ts';
import { createPlant, type Plant, runPlant, schedule } from '../../../src/sim/plant.ts';

type Rcf = (p: Packet) => Pick<Verdict, 'alert' | 'clear'>;
const QUIET: Rcf = () => ({ alert: false, clear: false });

/**
 * Bench in a box: plant + firmware + a synthetic RCF that answers every packet at once (no RCF exists before P4).
 * `rcf` decides each verdict. START is scheduled at t = 0.
 */
function bench(rcf: Rcf = QUIET) {
  const plant = createPlant(CONFIG, CONFIG.seed, { warmStart: true });
  const packets: Packet[] = [];
  const events: SimEvent[] = [];
  const logs: string[] = [];
  let fw: Firmware | null = null;
  fw = createFirmware({
    cfg: CONFIG,
    seed: CONFIG.seed,
    packetLoss: () => plant.faults.values.packetLoss,
    uplink: (p) => {
      packets.push(p);
      const verdict: Verdict = {
        v: PROTOCOL_VERSION,
        kind: 'verdict',
        seq_ref: p.seq,
        score: null,
        threshold: CONFIG.rcf.threshold,
        dominant: null,
        z: null,
        model: 'READY',
        ...rcf(p),
      };
      fw?.receiveVerdict(verdict, p.ts_ms / 1000);
    },
  });
  const firmware = fw;
  schedule(plant, { at_s: 0, kind: 'command', cmd: 'START' });
  const run = (t_s: number) => {
    runPlant(plant, firmware, t_s);
    events.push(...firmware.drainEvents());
    logs.push(...firmware.drainLogs());
  };
  return { plant, firmware, packets, events, logs, run };
}

/** Steps one physics step at a time until `done()`; returns the sim time. */
function until(b: ReturnType<typeof bench>, done: () => boolean, max_s = 30): number {
  const t0 = b.plant.t_s;
  while (!done() && b.plant.t_s - t0 < max_s) b.run(b.plant.dt_s);
  return b.plant.t_s;
}

const stateChanges = (events: SimEvent[]) => events.filter((e) => ['START', 'CALIBRATED', 'NORMAL', 'WARNING', 'CRITICAL', 'RESET'].includes(e.type)); // prettier-ignore

describe('logger (§7.7)', () => {
  it('formats [t=000123.456] LEVEL module: message', () => {
    expect(formatLog(123.4564, 'INFO', 'fsm', 'OFF -> CALIBRATING')).toBe(
      '[t=000123.456] INFO fsm: OFF -> CALIBRATING',
    );
    expect(formatLog(0.5, 'ERR', 'fsm', 'x')).toBe('[t=000000.500] ERR fsm: x');
  });
});

describe('firmware orchestrator (P3.6)', () => {
  it('a healthy 60 s run from START: 60 valid packets, OFF → CALIBRATING → STARTING → NORMAL, required logs', () => {
    const b = bench();
    b.run(60.0005);
    expect(b.packets).toHaveLength(60);
    for (const p of b.packets) expect(Packet.safeParse(p).success).toBe(true);
    expect(b.packets.map((p) => p.seq)).toEqual(Array.from({ length: 60 }, (_, k) => k));

    const seen = stateChanges(b.events).map((e) => e.type);
    expect(seen).toEqual(['START', 'CALIBRATED', 'NORMAL']);
    const t = (type: string) => b.events.find((e) => e.type === type)?.t_s ?? NaN;
    expect(t('START')).toBe(0);
    expect(t('CALIBRATED')).toBeCloseTo(CONFIG.firmware.calib_s, 9);
    expect(t('NORMAL')).toBeCloseTo(CONFIG.firmware.calib_s + CONFIG.firmware.startGrace_s, 9);
    expect(b.firmware.view().state).toBe('NORMAL');

    const text = b.logs.join('\n');
    expect(text).toMatch(/\[t=000000\.000\] INFO fsm: OFF -> CALIBRATING/);
    expect(text).toMatch(/\[t=000000\.500\] INFO fw: calibration counts0=\d+\.\d/);
    expect(text).toMatch(/INFO fsm: CALIBRATING -> STARTING/);
    expect(text).toMatch(/INFO fsm: STARTING -> NORMAL/);

    const normal = b.packets.filter((p) => p.state === 'NORMAL');
    const last = normal.at(-1);
    expect(last?.relay_ch2).toBe('ON');
    expect(Math.abs((last?.rpm ?? 0) - 3800)).toBeLessThan(60);
    expect(Math.abs((last?.i_rms_A ?? 0) - 0.18)).toBeLessThan(0.01);
    expect(Math.abs((last?.a_rms_g ?? 0) - 0.12)).toBeLessThan(0.02);
    expect(last?.t_C).toBeCloseTo(34.07, 0);
    expect(last).toMatchObject({ link_lost: false, sensor_fault: false, warn_reason: null, trip_reason: null });
  });

  it('opens the contacts within 20 ms of sim time after CRITICAL', () => {
    const b = bench();
    b.run(20);
    schedule(b.plant, { at_s: b.plant.t_s, kind: 'command', cmd: 'ESTOP' });
    const tOpen = until(b, () => b.plant.relay.contact === 'NC');
    const tCritical = b.events.find((e) => e.type === 'CRITICAL')?.t_s ?? NaN;
    expect(tOpen - tCritical).toBeLessThanOrEqual(0.02);
    expect(b.firmware.view()).toMatchObject({ state: 'CRITICAL', tripReason: 'ESTOP' });
  });

  it('RCF alerts: NORMAL → WARNING → CRITICAL (RCF) after nCritical, logging the trip with feature values', () => {
    const b = bench((p) => ({ alert: p.ts_ms > 20_000, clear: false }));
    b.run(30);
    const seen = stateChanges(b.events).map((e) => e.type);
    expect(seen).toEqual(['START', 'CALIBRATED', 'NORMAL', 'WARNING', 'CRITICAL']);
    const tWarn = b.events.find((e) => e.type === 'WARNING')?.t_s ?? NaN;
    const tCrit = b.events.find((e) => e.type === 'CRITICAL')?.t_s ?? NaN;
    expect(tCrit - tWarn).toBeCloseTo(CONFIG.firmware.nCritical - 1, 0);
    expect(b.firmware.view()).toMatchObject({ state: 'CRITICAL', tripReason: 'RCF', activeMap: 'sm.warn.trip' });
    expect(b.logs.join('\n')).toMatch(/ERR fsm: trip RCF a_rms=\d\.\d+g cf=\d\.\d+ i_rms=\d\.\d+A t=\d+\.\d+C rpm=\d+/);
  });

  it('refuses START while latched and RESET while the fan still turns, then resets once it has coasted down', () => {
    const b = bench();
    b.run(15);
    schedule(b.plant, { at_s: b.plant.t_s, kind: 'command', cmd: 'ESTOP' });
    schedule(b.plant, { at_s: b.plant.t_s + 1, kind: 'command', cmd: 'START' });
    schedule(b.plant, { at_s: b.plant.t_s + 1.2, kind: 'command', cmd: 'RESET' });
    b.run(2);
    expect(b.logs.join('\n')).toMatch(/ERR fsm: start refused: latched/);
    expect(b.logs.join('\n')).toMatch(/WARN fsm: reset refused: fan still turning/);
    b.run(15); // coast-down ≈ 9 s, then the next window measures rpm < 100
    schedule(b.plant, { at_s: b.plant.t_s, kind: 'command', cmd: 'RESET' });
    b.run(0.01);
    expect(b.firmware.view()).toMatchObject({ state: 'OFF', tripReason: null });
    expect(b.events.filter((e) => e.type === 'REFUSED')).toHaveLength(2);
  });

  it('overheat: T_SOFT warning, then a T_MAX trip', () => {
    const b = bench();
    schedule(b.plant, { at_s: 20, kind: 'fault', key: 'overheat', value: 1, ramp_s: 0 });
    b.run(400);
    const warn = b.packets.find((p) => p.warn_reason === 'T_SOFT');
    expect(warn?.t_C ?? 0).toBeGreaterThan(CONFIG.firmware.tMax_C - CONFIG.firmware.tWarnMargin_C);
    expect(b.firmware.view()).toMatchObject({ state: 'CRITICAL', tripReason: 'T_MAX' });
  });

  it('packetLoss 1.0: link_lost in packets and logs; the next verdict restores it', () => {
    const b = bench();
    schedule(b.plant, { at_s: 30, kind: 'fault', key: 'packetLoss', value: 1, ramp_s: 0 });
    schedule(b.plant, { at_s: 45, kind: 'fault', key: 'packetLoss', value: 0, ramp_s: 0 });
    b.run(50);
    // packets flagged link_lost while the loss lasts are dropped too; the firmware's own event gives the time.
    // The loss applies at the start of the 30 s step, so the window-30 packet is already dropped: the last verdict
    // is the one for window 29 (≈ 29.02 s).
    const tLost = b.events.find((e) => e.type === 'LINK_LOST')?.t_s ?? Infinity;
    expect(tLost).toBeGreaterThan(29 + CONFIG.link.lossTimeout_s);
    expect(tLost).toBeLessThanOrEqual(30 + CONFIG.link.lossTimeout_s + CONFIG.firmware.window_s);
    expect(b.packets.find((p) => p.ts_ms === 45_000)?.link_lost).toBe(true); // first packet through after the loss
    expect(b.packets.at(-1)?.link_lost).toBe(false);
    const text = b.logs.join('\n');
    expect(text).toMatch(/WARN link: link lost/);
    expect(text).toMatch(/INFO link: link restored/);
    expect(b.events.map((e) => e.type)).toEqual(expect.arrayContaining(['LINK_LOST', 'LINK_RESTORED']));
  });

  it('a disconnected DS18B20 sets sensor_fault and WARNING (SENSOR), never CRITICAL', () => {
    const b = bench();
    schedule(b.plant, { at_s: 30, kind: 'fault', key: 'ds18b20Disconnect', value: true, ramp_s: 0 });
    b.run(60);
    const p = b.packets.find((x) => x.sensor_fault);
    expect(p?.ts_ms ?? Infinity).toBeLessThanOrEqual(42_000);
    expect(b.firmware.view()).toMatchObject({ state: 'WARNING', sensorFault: true });
    expect(b.packets.find((x) => x.state === 'WARNING')?.warn_reason).toBe('SENSOR');
    expect(b.logs.join('\n')).toMatch(/WARN fw: sensor fault/);
  });

  it('emits packets in every state, including OFF before START', () => {
    const plant: Plant = createPlant(CONFIG, CONFIG.seed, { warmStart: true });
    const packets: Packet[] = [];
    const fw = createFirmware({ cfg: CONFIG, seed: 1, packetLoss: () => 0, uplink: (p) => packets.push(p) });
    runPlant(plant, fw, 3.0005);
    expect(packets.map((p) => p.state)).toEqual(['OFF', 'OFF', 'OFF']);
    expect(packets.every((p) => Packet.safeParse(p).success && p.relay_ch2 === 'OFF')).toBe(true);
    expect(fw.view()).toMatchObject({ state: 'OFF', nCritical: CONFIG.firmware.nCritical, activeMap: null });
  });
});
