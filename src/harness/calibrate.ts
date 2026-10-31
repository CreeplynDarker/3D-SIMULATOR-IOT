// Calibration (P8.4): fits the plant's fan, thermal and sensor-noise parameters to a recorded healthy session of
// packets (§10.1 window features only) and proposes values; it never edits config.ts. Pure.
// The session follows CALIBRATION_SCENARIO: rest → START from cold → run → E-STOP → coast and rest. Each parameter
// comes from the part of the recording where it shows alone (spec §6):
//   fan at rest (relay open, 0 rpm)   a_RMS² = 3 σ_mpu²; i_RMS² = σ_I² (after calibration only)
//   spin-up / coast-down windows      window-averaged first-order rpm curves → tauUp, tauDown and the switch times
//   steady running                    rpm → rpmRated; i_RMS² − σ_I² − ripple²/2 → iIdle + iAero; a_RMS → unbalance
//   heating from cold                 two first-order lags (C_th·R_th and the probe) → ambient, R_th, C_th
import { currentFromCounts_A } from '../firmware/features.ts';
import { CALIBRATED_KEYS, CALIBRATION_FIT as FIT, CALIBRATION_SCENARIO, type CalibratedKey, TUNING_RANGES } from '../shared/calibration.ts'; // prettier-ignore
import type { Packet } from '../shared/protocol.ts';
import type { Scenario } from '../shared/scenarios.ts';
import type { SimConfig } from '../sim/types.ts';
import { runScenario } from './runScenario.ts';

interface Win {
  a_s: number;
  b_s: number;
  p: Packet;
}

export interface CalibrationEntry {
  key: CalibratedKey;
  current: number;
  /** Null when the recording lacks the part this key is fitted from. */
  proposed: number | null;
  basis: string;
  /** Outside its §5.2 tuning range (a model the team should look at before taking the value). */
  outOfRange: boolean;
}

export interface CalibrationResult {
  entries: CalibrationEntry[];
  /** Fitted switching times (s of the recording's clock): relay closed at START, opened at E-STOP. */
  switch_s: { on: number; off: number | null };
  /** Windows used per part of the recording. */
  windows: { rest: number; spinUp: number; steady: number; coast: number; currentNoise: number; heating: number };
}

const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const msq = (xs: readonly number[]) => mean(xs.map((x) => x * x));

/** Minimum of f on [lo, hi]: a grid, then golden-section search around the best grid point. */
export function minimize1d(f: (x: number) => number, lo: number, hi: number): number {
  const step = (hi - lo) / (FIT.grid - 1);
  let best = 0;
  let bestF = Infinity;
  for (let i = 0; i < FIT.grid; i++) {
    const v = f(lo + i * step);
    if (v < bestF) [best, bestF] = [i, v];
  }
  let a = lo + Math.max(0, best - 1) * step;
  let b = lo + Math.min(FIT.grid - 1, best + 1) * step;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < FIT.goldenSteps; k++) {
    const c = b - g * (b - a);
    const d = a + g * (b - a);
    if (f(c) < f(d)) b = d;
    else a = c;
  }
  return (a + b) / 2;
}

/** Time constant τ (s, searched on a log scale) and switch time t (s) minimising sse(τ, t). */
function fitTauAndEdge(sse: (tau_s: number, t_s: number) => number, t0: number, t1: number) {
  const [lo, hi] = FIT.fanTau_s.map(Math.log) as [number, number];
  const edge = (tau_s: number) => minimize1d((t) => sse(tau_s, t), t0, t1);
  const tau_s = Math.exp(minimize1d((x) => sse(Math.exp(x), edge(Math.exp(x))), lo, hi));
  return { tau_s, t_s: edge(tau_s) };
}

/** Mean of ω/ω_full over [a, b] for a first-order spin-up from rest that starts at t0 (unitless). */
export function spinUpAverage(a_s: number, b_s: number, t0_s: number, tau_s: number): number {
  const F = (u: number) => (u <= 0 ? 0 : u - tau_s * (1 - Math.exp(-u / tau_s)));
  return (F(b_s - t0_s) - F(a_s - t0_s)) / (b_s - a_s);
}

/** Mean of ω/ω_full over [a, b] for a first-order coast-down from full speed that starts at t1 (unitless). */
export function coastAverage(a_s: number, b_s: number, t1_s: number, tau_s: number): number {
  const G = (u: number) => (u <= 0 ? u : tau_s * (1 - Math.exp(-u / tau_s)));
  return (G(b_s - t1_s) - G(a_s - t1_s)) / (b_s - a_s);
}

/** Probe reading rise (0…1) u s after a heat step: plant lag τ (s) then probe lag τp (s). */
export function twoLagStep(u_s: number, tau_s: number, tauP_s: number): number {
  if (u_s <= 0) return 0;
  if (Math.abs(tau_s - tauP_s) < 1e-9) return 1 - (1 + u_s / tau_s) * Math.exp(-u_s / tau_s);
  return 1 - (tau_s * Math.exp(-u_s / tau_s) - tauP_s * Math.exp(-u_s / tauP_s)) / (tau_s - tauP_s);
}

/** Speed at supply V over rated speed (unitless, §6.1 without friction). */
function speedRatio(cfg: SimConfig): number {
  const { vStart_V, vRated_V, vMax_V } = cfg.fan;
  const v_V = cfg.supply.v_V;
  return Math.min(Math.max((v_V - vStart_V) / (vRated_V - vStart_V), 0), (vMax_V - vStart_V) / (vRated_V - vStart_V));
}

/** The recording split into its parts (see the header); throws if the fan is never powered. */
function segments(packets: readonly Packet[], cfg: SimConfig) {
  const ws: Win[] = [...packets].sort((x, y) => x.ts_ms - y.ts_ms).map((p) => ({ a_s: (p.ts_ms - p.win_ms) / 1000, b_s: p.ts_ms / 1000, p })); // prettier-ignore
  const iOn = ws.findIndex((w) => w.p.relay_ch2 === 'ON');
  if (iOn < 0) throw new Error('the recording never powers the fan (no window with relay_ch2 ON)');
  const iOff = ws.findIndex((w, i) => i > iOn && w.p.relay_ch2 === 'OFF');
  const onEnd = iOff < 0 ? ws.length : iOff;
  const firstOn = ws[iOn] as Win;
  const { powerOn_C, disconnected_C } = cfg.sensors.ds18b20;
  return {
    ws,
    firstOn,
    rest: ws.slice(0, iOn).filter((w) => w.p.state === 'OFF' && w.p.rpm === 0),
    spinUp: ws.slice(Math.max(0, iOn - 1), iOn + FIT.transientWindows),
    // full speed: after the start grace, and not the last powered window (the stop may fall inside it)
    steady: ws.slice(iOn, iOff < 0 ? onEnd : onEnd - 1).filter((w) => w.a_s >= firstOn.b_s + cfg.firmware.startGrace_s), // prettier-ignore
    coast: iOff < 0 ? [] : ws.slice(iOff - 1, iOff + FIT.transientWindows),
    firstOff: iOff < 0 ? null : (ws[iOff] as Win),
    // relay open after the calibration: no current flows, so i_RMS is the noise alone
    offAfterCal: iOff < 0 ? [] : ws.slice(iOff).filter((w) => w.p.relay_ch2 === 'OFF'),
    heating: ws.slice(0, onEnd).filter((w) => w.p.t_C !== null && w.p.t_C !== powerOn_C && w.p.t_C !== disconnected_C), // prettier-ignore
  };
}

type Fitted = Partial<Record<CalibratedKey, number>>;

/** Fan speed curves: rpmRated, tauUp, tauDown and the two switch times. */
function fitSpeed(seg: ReturnType<typeof segments>, cfg: SimConfig, out: Fitted) {
  if (seg.steady.length === 0) throw new Error('the recording has no steady running after the start grace');
  const rpmFull = mean(seg.steady.map((w) => w.p.rpm));
  out['fan.rpmRated'] = rpmFull / speedRatio(cfg);
  const sse = (avg: (w: Win, tau_s: number, t_s: number) => number, wins: readonly Win[]) => (tau_s: number, t_s: number) => wins.reduce((s, w) => s + (w.p.rpm - rpmFull * avg(w, tau_s, t_s)) ** 2, 0); // prettier-ignore
  const up = fitTauAndEdge(
    sse((w, tau, t) => spinUpAverage(w.a_s, w.b_s, t, tau), seg.spinUp),
    seg.firstOn.a_s - FIT.edgeSearch_s,
    seg.firstOn.b_s,
  );
  out['fan.tauUp_s'] = up.tau_s;
  if (!seg.firstOff) return { on: up.t_s, off: null };
  const down = fitTauAndEdge(
    sse((w, tau, t) => coastAverage(w.a_s, w.b_s, t, tau), seg.coast),
    seg.firstOff.a_s - FIT.edgeSearch_s,
    seg.firstOff.b_s + FIT.edgeSearch_s,
  );
  out['fan.tauDown_s'] = down.tau_s;
  return { on: up.t_s, off: down.t_s };
}

/** Sensor noise from the fan-at-rest windows, and the running current with that noise taken out. */
function fitNoiseAndCurrent(seg: ReturnType<typeof segments>, cfg: SimConfig, switchOff_s: number | null, out: Fitted) {
  const { mpu, acs712, adc, divider } = cfg.sensors;
  const q_g = 1 / mpu.lsbPerG;
  // relay open for a whole window: the window where it opened, and the next (the contact releases late), still
  // carry running current
  const off = switchOff_s === null ? [] : seg.offAfterCal.filter((w) => w.a_s >= switchOff_s + w.p.win_ms / 1000);
  const settled = off.filter((w) => w.p.rpm === 0 && w.a_s >= (switchOff_s ?? 0) + FIT.coastSettleTaus * (out['fan.tauDown_s'] ?? cfg.fan.tauDown_s)); // prettier-ignore
  const still = [...seg.rest, ...settled];
  if (still.length > 0) out['sensors.mpu.noise_g'] = Math.sqrt(Math.max(0, msq(still.map((w) => w.p.a_rms_g)) / 3 - (q_g * q_g) / 12)); // prettier-ignore
  const a_per_count = currentFromCounts_A(1, 0, cfg);
  const g_counts_per_V =
    (adc.maxCount / adc.vSpan_V) * (divider.rBottom_ohm / (divider.rTop_ohm + divider.rBottom_ohm));
  const base = (g_counts_per_V * acs712.noise_V) ** 2 + adc.noise_counts ** 2;
  let sigmaI2 = a_per_count ** 2 * (base + 1 / 12); // the config's prediction, if the recording never rests
  if (off.length > 0) {
    sigmaI2 = msq(off.map((w) => w.p.i_rms_A));
    const scale = Math.sqrt(Math.max(0, sigmaI2 / a_per_count ** 2 - 1 / 12) / base);
    out['sensors.acs712.noise_V'] = acs712.noise_V * scale;
    out['sensors.adc.noise_counts'] = adc.noise_counts * scale;
  }
  const i_A = Math.sqrt(Math.max(0, msq(seg.steady.map((w) => w.p.i_rms_A)) - sigmaI2 - cfg.fan.iRipple_A ** 2 / 2));
  const r = speedRatio(cfg);
  const scale = i_A / (cfg.fan.iIdle_A + cfg.fan.iAero_A * r ** 3);
  out['fan.iIdle_A'] = cfg.fan.iIdle_A * scale;
  out['fan.iAero_A'] = cfg.fan.iAero_A * scale;
  return {
    i_A,
    sigmaMpu_g: out['sensors.mpu.noise_g'] ?? mpu.noise_g,
    settled: settled.length,
    currentNoise: off.length,
  };
}

/** Heating from cold: ambient, R_th and C_th from the probe readings while the fan runs. */
function fitThermal(seg: ReturnType<typeof segments>, cfg: SimConfig, on_s: number, i_A: number, out: Fitted) {
  const pts = seg.heating.map((w) => ({ t_s: w.b_s - w.p.win_ms / 1000 / 2, y: w.p.t_C as number }));
  if (pts.length < 3 || (pts.at(-1)?.t_s ?? on_s) <= on_s) return;
  const tauP_s = cfg.sensors.ds18b20.probeTau_s;
  const solve = (tau_s: number) => {
    const h = pts.map((p) => twoLagStep(p.t_s - on_s, tau_s, tauP_s));
    const [n, sh, shh] = [pts.length, h.reduce((s, x) => s + x, 0), h.reduce((s, x) => s + x * x, 0)];
    const [sy, shy] = [pts.reduce((s, p) => s + p.y, 0), pts.reduce((s, p, i) => s + p.y * (h[i] as number), 0)];
    const det = n * shh - sh * sh;
    const rise_K = det === 0 ? 0 : (n * shy - sh * sy) / det;
    const amb_C = (sy - rise_K * sh) / n;
    const sse = pts.reduce((s, p, i) => s + (p.y - amb_C - rise_K * (h[i] as number)) ** 2, 0);
    return { amb_C, rise_K, sse };
  };
  const [lo, hi] = FIT.thermalTau_s.map(Math.log) as [number, number];
  const tau_s = Math.exp(minimize1d((x) => solve(Math.exp(x)).sse, lo, hi));
  const { amb_C, rise_K } = solve(tau_s);
  const heat_W = cfg.thermal.heatFraction * cfg.supply.v_V * i_A;
  if (rise_K <= 0 || heat_W <= 0) return;
  const rEff_KperW = rise_K / heat_W;
  out['thermal.ambient_C'] = amb_C;
  out['thermal.rTh0_KperW'] = rEff_KperW * (1 + cfg.thermal.airflowCooling * speedRatio(cfg));
  out['thermal.cTh_JperK'] = tau_s / rEff_KperW;
}

/** Value at a dotted config path such as `sensors.mpu.noise_g`. */
export function configValue(cfg: SimConfig, key: string): number {
  const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], cfg);
  if (typeof v !== 'number') throw new Error(`${key} is not a number in the config`);
  return v;
}

/** `cfg` with each dotted `key` set to its value of the same type (a copy; `cfg` is not changed). */
export function withValues(cfg: SimConfig, values: Partial<Record<string, number | boolean>>): SimConfig {
  const out = structuredClone(cfg) as unknown as Record<string, unknown>;
  for (const [key, v] of Object.entries(values)) {
    if (v === undefined) continue;
    const path = key.split('.');
    const last = path.pop() as string;
    const parent = path.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, out);
    if (typeof parent[last] !== typeof v) throw new Error(`${key} is not a ${typeof v} in the config`);
    parent[last] = v;
  }
  return out as unknown as SimConfig;
}

/** Mean squared a_RMS from vibration alone (g²) in a short healthy run of `cfg`. */
function simVibration2(cfg: SimConfig): number {
  const scenario: Scenario = {
    id: 'CAL-VIB',
    title: 'calibration vibration',
    guided: false,
    end_s: FIT.vibSettle_s + FIT.vibWindows_s,
    steps: [{ at_s: 0, action: { kind: 'command', cmd: 'START' } }],
  };
  const warm = withValues(cfg, { 'thermal.warmStart': true });
  const { packets } = runScenario(scenario, { seed: cfg.seed, config: warm, model: null });
  const steady = packets.filter((p) => (p.ts_ms - p.win_ms) / 1000 >= FIT.vibSettle_s).map((p) => p.a_rms_g);
  const q_g = 1 / cfg.sensors.mpu.lsbPerG;
  return msq(steady) - 3 * (cfg.sensors.mpu.noise_g ** 2 + (q_g * q_g) / 12);
}

/** Residual unbalance (g·mm) whose simulated a_RMS matches the recording's; A1 is linear in it (§6.3). */
function fitUnbalance(seg: ReturnType<typeof segments>, cfg: SimConfig, sigmaMpu_g: number, out: Fitted) {
  const q_g = 1 / cfg.sensors.mpu.lsbPerG;
  const measured = msq(seg.steady.map((w) => w.p.a_rms_g)) - 3 * (sigmaMpu_g ** 2 + (q_g * q_g) / 12);
  let u_gmm = cfg.fan.residualUnbalance_gmm;
  for (let k = 0; k < FIT.vibIterations; k++) {
    const sim = simVibration2(withValues(cfg, { ...out, 'fan.residualUnbalance_gmm': u_gmm }));
    if (sim <= 0 || measured <= 0) return;
    u_gmm *= Math.sqrt(measured / sim);
  }
  out['fan.residualUnbalance_gmm'] = u_gmm;
}

const BASIS: Record<CalibratedKey, string> = {
  'fan.rpmRated': 'mean rpm while running',
  'fan.tauUp_s': 'spin-up rpm windows',
  'fan.tauDown_s': 'coast-down rpm windows after E-STOP',
  'fan.iIdle_A': 'running i_RMS less noise and ripple (scaled with iAero)',
  'fan.iAero_A': 'running i_RMS less noise and ripple (scaled with iIdle)',
  'fan.residualUnbalance_gmm': 'running a_RMS less noise, matched in a short sim',
  'thermal.ambient_C': 'probe readings: heating from cold',
  'thermal.rTh0_KperW': 'probe readings: temperature rise over heat',
  'thermal.cTh_JperK': 'probe readings: heating time constant over R_th',
  'sensors.mpu.noise_g': 'a_RMS with the fan at rest',
  'sensors.acs712.noise_V': 'i_RMS with the relay open (scaled with the ADC noise)',
  'sensors.adc.noise_counts': 'i_RMS with the relay open (scaled with the ACS712 noise)',
};

/** Whether `v` is outside the §5.2 tuning range of `key` (relative ranges are to the current value). */
function outOfRange(key: CalibratedKey, current: number, v: number): boolean {
  const r = TUNING_RANGES[key];
  if (!r) return false;
  const [lo, hi] = r.absolute ?? (r.relative ?? [0, Infinity]).map((x) => x * current);
  return v < (lo as number) || v > (hi as number);
}

/** Fits `packets` (a healthy CALIBRATION_SCENARIO recording) starting from `cfg`; returns the proposed values. */
export function calibrate(packets: readonly Packet[], cfg: SimConfig): CalibrationResult {
  const seg = segments(packets, cfg);
  const out: Fitted = {};
  const switch_s = fitSpeed(seg, cfg, out);
  const speedCfg = withValues(cfg, out);
  const { i_A, sigmaMpu_g, settled, currentNoise } = fitNoiseAndCurrent(seg, speedCfg, switch_s.off, out);
  fitThermal(seg, cfg, switch_s.on, i_A, out);
  fitUnbalance(seg, cfg, sigmaMpu_g, out);
  const entries = CALIBRATED_KEYS.map((key) => {
    const current = configValue(cfg, key);
    const proposed = out[key] ?? null;
    return { key, current, proposed, basis: BASIS[key], outOfRange: proposed !== null && outOfRange(key, current, proposed) }; // prettier-ignore
  });
  const windows = {
    rest: seg.rest.length + settled,
    spinUp: seg.spinUp.length,
    steady: seg.steady.length,
    coast: seg.coast.length,
    currentNoise,
    heating: seg.heating.length,
  };
  return { entries, switch_s, windows };
}

/** `cfg` with every proposed value of `result` applied. */
export function applyCalibration(cfg: SimConfig, result: CalibrationResult): SimConfig {
  return withValues(cfg, Object.fromEntries(result.entries.filter((e) => e.proposed !== null).map((e) => [e.key, e.proposed as number]))); // prettier-ignore
}

/** A simulated calibration recording of `cfg` (cold start, CALIBRATION_SCENARIO): its packets. */
export function recordCalibration(cfg: SimConfig, seed: number): Packet[] {
  const cold = withValues(cfg, { 'thermal.warmStart': false });
  return runScenario(CALIBRATION_SCENARIO, { seed, config: cold, model: null }).packets;
}

/** Means of the running windows (after the start grace): rpm, a_RMS (g), crest factor, i_RMS (A), t_C (°C). */
export function baselineMeans(packets: readonly Packet[], cfg: SimConfig) {
  const steady = segments(packets, cfg).steady.map((w) => w.p);
  const temps = steady.map((p) => p.t_C).filter((t): t is number => t !== null);
  return {
    rpm: mean(steady.map((p) => p.rpm)),
    a_rms_g: mean(steady.map((p) => p.a_rms_g)),
    cf: mean(steady.map((p) => p.cf)),
    i_rms_A: mean(steady.map((p) => p.i_rms_A)),
    t_C: mean(temps),
  };
}
