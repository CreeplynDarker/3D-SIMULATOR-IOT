// Firmware orchestrator (spec §7): the plant's Controller (D-031). Each 1 kHz tick samples, calibrates and runs the
// timers; each window end computes features, evaluates limits, steps the state machine and sends one packet; each
// verdict delivered by the link drives the RCF rows. It sees only what a real ESP32 sees.
import type { SimEvent, SimEventType } from '../shared/messages.ts';
import { type Command, type Packet, PROTOCOL_VERSION, type Verdict } from '../shared/protocol.ts';
import type { Controller, FirmwareView, SensorsView } from '../sim/plant.ts';
import type { GpioLevel, SimConfig } from '../sim/types.ts';
import { GPIO_LOW } from '../sim/types.ts';
import { addTempReading, computeFeatures, createTempTracker, tempFeatures, type WindowFeatures } from './features.ts';
import { createLimits, evaluateLimits, noteVerdict, resetLinkTimer } from './limits.ts';
import { createLink, dueVerdicts, receiveVerdict, sendPacket } from './link.ts';
import { createLogger } from './logger.ts';
import { createSampler, samplerTick, type WindowData } from './sampler.ts';
import { createFsm, type Outcome, transition, type Trigger } from './stateMachine.ts';

export interface FirmwareOptions {
  cfg: SimConfig;
  /** Seed for the link's random stream. */
  seed: number;
  /** Uplink transport: hands a packet that survived the link to the RCF. */
  uplink: (packet: Packet) => void;
  /** Current packet loss (0–1) of the "Wi-Fi" — an environment fault, not something the ESP32 measures. */
  packetLoss: () => number;
}

export interface Firmware extends Controller {
  command(cmd: Command['cmd'], t_s: number): void;
  afterStep(t_s: number): void;
  /** A verdict from the RCF reaching the link at sim time `now_s`. */
  receiveVerdict(verdict: Verdict, now_s: number): void;
  view(): FirmwareView;
  drainLogs(): string[];
  drainEvents(): SimEvent[];
}

/** Zero-current ADC reading from the datasheet values, used until the first calibration (counts). */
function nominalCounts0(cfg: SimConfig): number {
  const { adc, divider, acs712 } = cfg.sensors;
  const vPin_V = (acs712.vZero_V * divider.rBottom_ohm) / (divider.rTop_ohm + divider.rBottom_ohm);
  return (adc.maxCount * (vPin_V - adc.vMin_V)) / adc.vSpan_V;
}

/** Creates the firmware at boot: OFF, relay de-energised, window 0 open. */
export function createFirmware(opts: FirmwareOptions): Firmware {
  const { cfg } = opts;
  const fsm = createFsm();
  const sampler = createSampler(cfg);
  const temps = createTempTracker();
  const limits = createLimits(0);
  const link = createLink(opts.seed, cfg);
  const logger = createLogger();
  let events: SimEvent[] = [];
  let counts0 = nominalCounts0(cfg);
  let calibSum = 0;
  let calibN = 0;
  let enteredAt_s = 0;
  let lastValidTemp_s = 0;
  let lastFeatures: (WindowFeatures & { t_C: number | null }) | null = null;

  const emit = (t_s: number, type: SimEventType, detail?: string) =>
    events.push(detail === undefined ? { t_s, type } : { t_s, type, detail });

  const featureText = () => {
    const f = lastFeatures;
    if (!f) return '';
    return ` a_rms=${f.a_rms_g.toFixed(3)}g cf=${f.cf.toFixed(2)} i_rms=${f.i_rms_A.toFixed(3)}A t=${f.t_C?.toFixed(2) ?? 'null'}C rpm=${f.rpm.toFixed(0)}`; // prettier-ignore
  };

  /** Runs one trigger through the state machine and records its logs, events and timers. */
  const fire = (trigger: Trigger, t_s: number): Outcome => {
    const out = transition(fsm, trigger, cfg);
    for (const l of out.log) logger.log(t_s, l.level, 'fsm', l.text.startsWith('trip ') ? l.text + featureText() : l.text); // prettier-ignore
    for (const type of out.events) emit(t_s, type, out.map ?? undefined);
    if (out.to !== null && out.to !== out.from) enteredAt_s = t_s;
    if (out.to === 'CALIBRATING') {
      calibSum = 0;
      calibN = 0;
      resetLinkTimer(limits, t_s);
    }
    return out;
  };

  const runTimers = (t_s: number) => {
    const eps_s = 1e-9;
    if (fsm.state === 'CALIBRATING' && t_s - enteredAt_s >= cfg.firmware.calib_s - eps_s) {
      counts0 = calibN > 0 ? calibSum / calibN : counts0;
      logger.log(t_s, 'INFO', 'fw', `calibration counts0=${counts0.toFixed(1)}`);
      fire({ kind: 'calibDone' }, t_s);
    } else if (fsm.state === 'STARTING' && t_s - enteredAt_s >= cfg.firmware.startGrace_s - eps_s) {
      fire({ kind: 'graceDone' }, t_s);
    }
  };

  const buildPacket = (w: WindowData, f: WindowFeatures, temp: ReturnType<typeof tempFeatures>): Packet => ({
    v: PROTOCOL_VERSION,
    kind: 'packet',
    seq: w.index,
    ts_ms: Math.round(w.tEnd_s * 1000),
    win_ms: Math.round(cfg.firmware.window_s * 1000),
    a_rms_g: f.a_rms_g,
    cf: f.cf,
    i_rms_A: f.i_rms_A,
    t_C: temp.t_C,
    dtdt_C_per_min: temp.dtdt_C_per_min,
    rpm: f.rpm,
    state: fsm.state,
    relay_ch2: fsm.gpio26 === GPIO_LOW ? 'ON' : 'OFF',
    link_lost: limits.linkLost,
    sensor_fault: limits.sensorFault,
    warn_reason: fsm.warnReason,
    trip_reason: fsm.tripReason,
  });

  /** Window end: features → limits → state machine → one packet over the link. */
  const windowEnd = (w: WindowData, t_s: number) => {
    const f = computeFeatures(w, counts0, cfg);
    const temp = tempFeatures(temps, t_s, cfg);
    lastFeatures = { ...f, t_C: temp.t_C };
    fsm.rpm = f.rpm;
    const r = evaluateLimits(limits, { state: fsm.state, tEnd_s: t_s, ...f, t_C: temp.t_C, lastValidTemp_s }, cfg);
    if (r.sensorChanged) {
      logger.log(t_s, r.sensorFault ? 'WARN' : 'INFO', 'fw', r.sensorFault ? 'sensor fault: no valid DS18B20 reading' : 'sensor ok'); // prettier-ignore
      emit(t_s, r.sensorFault ? 'SENSOR_FAULT' : 'SENSOR_OK');
    }
    if (r.linkChanged && r.linkLost) {
      logger.log(t_s, 'WARN', 'link', 'link lost');
      emit(t_s, 'LINK_LOST');
    }
    fsm.linkLost = r.linkLost;
    fsm.softActive = r.soft !== null;
    if (r.trip) fire({ kind: 'trip', reason: r.trip }, t_s);
    else if (r.soft) fire({ kind: 'soft', reason: r.soft }, t_s);
    sendPacket(link, buildPacket(w, f, temp), t_s, opts.packetLoss(), opts.uplink);
  };

  return {
    tick(view: SensorsView): GpioLevel {
      const t_s = view.t_s;
      const s = samplerTick(sampler, view);
      if (s.dsRead && addTempReading(temps, s.dsRead, cfg)) lastValidTemp_s = s.dsRead.t_s;
      if (s.window) windowEnd(s.window, t_s);
      runTimers(t_s);
      if (fsm.state === 'CALIBRATING') {
        calibSum += view.adcCounts;
        calibN++;
      }
      return fsm.gpio26;
    },
    command(cmd, t_s) {
      fire({ kind: 'cmd', cmd }, t_s);
    },
    afterStep(t_s) {
      for (const v of dueVerdicts(link, t_s)) {
        if (noteVerdict(limits, t_s)) {
          logger.log(t_s, 'INFO', 'link', 'link restored');
          emit(t_s, 'LINK_RESTORED');
        }
        fsm.linkLost = false;
        fire({ kind: 'verdict', alert: v.alert, clear: v.clear }, t_s);
      }
    },
    receiveVerdict(verdict, now_s) {
      receiveVerdict(link, verdict, now_s);
    },
    view: () => ({
      state: fsm.state,
      alertRun: fsm.alertRun,
      nCritical: cfg.firmware.nCritical,
      linkLost: limits.linkLost,
      sensorFault: limits.sensorFault,
      tripReason: fsm.tripReason,
      activeMap: fsm.activeMap,
    }),
    drainLogs: () => logger.lines.splice(0),
    drainEvents: () => {
      const out = events;
      events = [];
      return out;
    },
  };
}
