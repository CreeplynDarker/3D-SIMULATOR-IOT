import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import {
  type Controller,
  createPlant,
  type Plant,
  runPlant,
  schedule,
  type SensorsView,
  toSnapshot,
} from '../../../src/sim/plant.ts';
import { GPIO_HIGH, GPIO_LOW, type GpioLevel } from '../../../src/sim/types.ts';

/** Stand-in for the firmware: drives GPIO26 LOW (fan on) from `on_s` and records every 1 kHz sample. */
function recorder(on_s = 0) {
  const accel: [number, number, number][] = [];
  const current_A: number[] = [];
  const commands: string[] = [];
  let plant: Plant | null = null;
  const controller: Controller = {
    tick(view: SensorsView): GpioLevel {
      accel.push([view.accel_g[0] ?? 0, view.accel_g[1] ?? 0, view.accel_g[2] ?? 0]);
      current_A.push(plant?.fan.currentInst_A ?? 0);
      return view.t_s >= on_s ? GPIO_LOW : GPIO_HIGH;
    },
    command(cmd) {
      commands.push(cmd);
    },
  };
  return { controller, accel, current_A, commands, attach: (p: Plant) => (plant = p) };
}

const SAMPLES_PER_WINDOW = CONFIG.firmware.sampleRate_Hz * CONFIG.firmware.window_s;

/** a_RMS (g) of one window: per-axis mean removed, RMS of the vector magnitude (as in the prototype). */
function aRms_g(window: [number, number, number][]): number {
  const mean = [0, 1, 2].map((k) => window.reduce((s, a) => s + (a[k] ?? 0), 0) / window.length);
  const ss = window.reduce((s, a) => s + a.reduce((t, x, k) => t + (x - (mean[k] ?? 0)) ** 2, 0), 0);
  return Math.sqrt(ss / window.length);
}
const rms = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);

/** Mean a_RMS and I_RMS over the last `n` whole windows. */
function lastWindows(rec: ReturnType<typeof recorder>, n: number) {
  let a = 0;
  let i = 0;
  for (let w = 1; w <= n; w++) {
    const from = rec.accel.length - w * SAMPLES_PER_WINDOW;
    a += aRms_g(rec.accel.slice(from, from + SAMPLES_PER_WINDOW));
    i += rms(rec.current_A.slice(from, from + SAMPLES_PER_WINDOW));
  }
  return { aRms_g: a / n, iRms_A: i / n };
}

function healthyAndImbalanced() {
  const run = (imbalance_g: number) => {
    const rec = recorder();
    const p = createPlant(CONFIG, CONFIG.seed, { warmStart: true });
    rec.attach(p);
    schedule(p, { at_s: 0, kind: 'fault', key: 'imbalance_g', value: imbalance_g, ramp_s: 0 });
    runPlant(p, rec.controller, 12);
    return lastWindows(rec, 5);
  };
  return { healthy: run(0), imbalanced: run(0.3) };
}

describe('plant integration (§6.10)', () => {
  it('same seed + same fault script → identical arrays (JSON byte-equal)', () => {
    const trace = (seed: number) => {
      const rec = recorder(0.5);
      const p = createPlant(CONFIG, seed, { warmStart: true });
      rec.attach(p);
      schedule(p, { at_s: 3, kind: 'fault', key: 'looseness', value: 0.6, ramp_s: 0 });
      schedule(p, { at_s: 4, kind: 'fault', key: 'friction', value: 0.5, ramp_s: 2 });
      schedule(p, { at_s: 6, kind: 'fault', key: 'ds18b20Disconnect', value: true, ramp_s: 0 });
      schedule(p, { at_s: 7, kind: 'clearFaults' });
      runPlant(p, rec.controller, 8);
      return JSON.stringify({ accel: rec.accel, current: rec.current_A, snap: toSnapshot(p), events: p.events });
    };
    const a = trace(CONFIG.seed);
    expect(trace(CONFIG.seed)).toBe(a);
    expect(trace(CONFIG.seed + 1)).not.toBe(a);
  });

  it('imbalance 0.3 g raises a_RMS by ≥ 3× while I_RMS changes < 5%', () => {
    const { healthy, imbalanced } = healthyAndImbalanced();
    expect(healthy.aRms_g).toBeGreaterThan(0.08); // prototype: ≈ 0.12 g healthy
    expect(healthy.aRms_g).toBeLessThan(0.16);
    expect(imbalanced.aRms_g / healthy.aRms_g).toBeGreaterThanOrEqual(3);
    expect(Math.abs(imbalanced.iRms_A - healthy.iRms_A) / healthy.iRms_A).toBeLessThan(0.05);
  });

  it('runs 600 s of sim in < 3 s of wall time in Node', { timeout: 60_000 }, () => {
    // A child process times the plant as plain Node runs it, without the coverage instrumentation of this process.
    const root = resolve(import.meta.dirname, '../../..');
    const code = [
      `const { CONFIG } = await import(${JSON.stringify(pathToFileURL(join(root, 'src/shared/config.ts')).href)});`,
      `const { createPlant, runPlant } = await import(${JSON.stringify(pathToFileURL(join(root, 'src/sim/plant.ts')).href)});`,
      'const p = createPlant(CONFIG, CONFIG.seed, { warmStart: true });',
      'const t0 = performance.now();',
      'runPlant(p, { tick: () => 0 }, 600);',
      'console.log(JSON.stringify({ t_s: p.t_s, wall_s: (performance.now() - t0) / 1000 }));',
    ].join('\n');
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
    const { t_s, wall_s } = JSON.parse(out.trim().split('\n').at(-1) ?? '{}') as { t_s: number; wall_s: number };
    expect(t_s).toBeCloseTo(600, 9);
    expect(wall_s).toBeLessThan(3);
  });

  it('keeps the fan off until the firmware drives GPIO26 LOW, then closes NO 10 ms later', () => {
    const rec = recorder(1);
    const p = createPlant(CONFIG, CONFIG.seed, { warmStart: true });
    runPlant(p, rec.controller, 1);
    expect(p.relay.contact).toBe('NC');
    expect(p.fan.voltage_V).toBe(0);
    runPlant(p, rec.controller, 0.0095);
    expect(p.relay.contact).toBe('NC');
    runPlant(p, rec.controller, 0.001);
    expect(p.relay.contact).toBe('NO');
    runPlant(p, rec.controller, 5);
    expect(Math.abs(p.fan.rpm - 3800) / 3800).toBeLessThan(0.02);
  });

  it('samples sensors at 1 kHz, using the outputs of the previous step', () => {
    const rec = recorder();
    const p = createPlant(CONFIG, CONFIG.seed, { warmStart: true });
    runPlant(p, rec.controller, 2);
    expect(rec.accel).toHaveLength(2 * CONFIG.firmware.sampleRate_Hz);
    expect(p.view.adcCounts).toBeGreaterThan(0);
    expect(p.view.dsReadings).toBe(2);
  });

  it('applies scheduled faults at their time and forwards commands to the firmware', () => {
    const rec = recorder();
    const p = createPlant(CONFIG, CONFIG.seed, { warmStart: true });
    schedule(p, { at_s: 1, kind: 'fault', key: 'supplySag_V', value: 2, ramp_s: 0 });
    schedule(p, { at_s: 0.5, kind: 'command', cmd: 'START' });
    runPlant(p, rec.controller, 0.999);
    expect(p.faults.values.supplySag_V).toBe(0);
    expect(rec.commands).toEqual(['START']);
    runPlant(p, rec.controller, 0.002);
    expect(p.faults.values.supplySag_V).toBe(2);
    expect(p.supply_V).toBe(10);
    expect(p.events.map((e) => e.type)).toEqual(['FAULT_SET']);
  });

  it('calls afterStep once per step and tolerates a firmware without a command handler', () => {
    const p = createPlant(CONFIG, CONFIG.seed, { warmStart: false });
    const ends: number[] = [];
    schedule(p, { at_s: 0, kind: 'command', cmd: 'ESTOP' });
    runPlant(p, { tick: () => GPIO_HIGH, afterStep: (t) => ends.push(t) }, 0.002);
    expect(ends).toEqual([0.0005, 0.001, 0.0015, 0.002]);
    expect(p.actions).toEqual([]);
    expect(p.thermal.tMotor_C).toBeCloseTo(CONFIG.thermal.ambient_C, 9);
  });

  it('builds a snapshot of the plant with firmware fields defaulted', () => {
    const rec = recorder();
    const p = createPlant(CONFIG, CONFIG.seed, { warmStart: true });
    runPlant(p, rec.controller, 3);
    const s = toSnapshot(p);
    expect(s.t_s).toBeCloseTo(3, 9);
    expect(s.contact).toBe('NO');
    expect(s.gpio26).toBe(GPIO_LOW);
    expect(s.rpm).toBeGreaterThan(3000);
    expect(s.acsOut_V).toBeGreaterThan(2.5);
    expect(s.adcPin_V).toBeCloseTo((s.acsOut_V * 2) / 3, 9);
    expect(s.state).toBe('OFF');
    expect(s.faults).not.toBe(p.faults.values); // a copy, safe to post
  });

  it('overheat raises the motor temperature and the probe follows', () => {
    const rec = recorder();
    const p = createPlant(CONFIG, CONFIG.seed, { warmStart: true });
    schedule(p, { at_s: 0, kind: 'fault', key: 'overheat', value: 1, ramp_s: 0 });
    runPlant(p, rec.controller, 60);
    expect(p.thermal.tMotor_C).toBeGreaterThan(40);
    expect(p.ds.probe_C).toBeGreaterThan(38);
    expect(p.view.dsReading_C).toBeGreaterThan(38);
  });
});
