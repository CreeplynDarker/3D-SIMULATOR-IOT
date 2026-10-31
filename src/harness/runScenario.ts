// Scenario harness (spec §10.4): plant + firmware + RCF in one single-threaded loop. The RCF answers each uplink
// packet synchronously and its verdict enters the firmware's link at that sim time, so the link model alone decides
// delivery, as in the workers (D-036). Same seed + same script → byte-identical JSON.
import { createFirmware } from '../firmware/firmware.ts';
import { loadModel, type ModelJson, type RcfModel, scorePacket } from '../rcf/model.ts';
import type { SimEvent } from '../shared/messages.ts';
import type { Packet, State, TripReason, Verdict } from '../shared/protocol.ts';
import type { Scenario, ScenarioAction } from '../shared/scenarios.ts';
import { createPlant, type FirmwareView, type Plant, type PlantAction, schedule, stepPlant } from '../sim/plant.ts';
import type { SimConfig } from '../sim/types.ts';

export interface RunOptions {
  seed: number;
  config: SimConfig;
  /** Saved model to score with (a fresh forest per run), or null for unscored verdicts. */
  model: ModelJson | null;
}

export interface VerdictRecord {
  /** Sim time the RCF answered, i.e. the packet's window end (s). */
  sent_s: number;
  /** Sim time the link delivered it to the firmware (s), or null if the run ended first. */
  delivered_s: number | null;
  verdict: Verdict;
}

/** Plant and firmware state at each whole second of sim time. */
export interface TimelineRow {
  t_s: number;
  state: State;
  rpm: number;
  contact: 'NC' | 'NO';
  current_A: number;
  tMotor_C: number;
  dsReading_C: number;
  linkLost: boolean;
  sensorFault: boolean;
  tripReason: TripReason | null;
}

export interface ScenarioResult {
  packets: Packet[];
  verdicts: VerdictRecord[];
  logs: string[];
  events: SimEvent[];
  timeline: TimelineRow[];
}

const toPlantAction = (at_s: number, a: ScenarioAction): PlantAction =>
  a.kind === 'fault'
    ? { at_s, kind: 'fault', key: a.key, value: a.value, ramp_s: a.ramp_s }
    : a.kind === 'clearFaults'
      ? { at_s, kind: 'clearFaults' }
      : { at_s, kind: 'command', cmd: a.cmd };

/** Timeline row from the plant and the firmware's view (units as in `TimelineRow`). */
const row = (p: Plant, fw: FirmwareView): TimelineRow => ({
  t_s: p.t_s,
  state: fw.state,
  rpm: p.fan.rpm,
  contact: p.relay.contact,
  current_A: p.fan.current_A,
  tMotor_C: p.thermal.tMotor_C,
  dsReading_C: p.ds.reading_C,
  linkLost: fw.linkLost,
  sensorFault: fw.sensorFault,
  tripReason: fw.tripReason,
});

/** Runs `scenario` from t = 0 to its end and returns everything that crossed the bench (times in s of sim time). */
export function runScenario(scenario: Scenario, opts: RunOptions): ScenarioResult {
  const { config: cfg, seed } = opts;
  const plant = createPlant(cfg, seed, { warmStart: cfg.thermal.warmStart });
  const model: RcfModel | null = opts.model ? loadModel(opts.model) : null;
  const out: ScenarioResult = { packets: [], verdicts: [], logs: [], events: [], timeline: [] };
  const bySeq = new Map<number, VerdictRecord>();
  const firmware = createFirmware({
    cfg,
    seed,
    packetLoss: () => plant.faults.values.packetLoss,
    uplink: (packet) => {
      out.packets.push(packet);
      const verdict = scorePacket(model, packet, cfg, model ? 'READY' : 'UNTRAINED');
      const record: VerdictRecord = { sent_s: plant.t_s, delivered_s: null, verdict };
      out.verdicts.push(record);
      bySeq.set(packet.seq, record);
      firmware.receiveVerdict(verdict, plant.t_s);
    },
    onVerdictDelivered: (v, t_s) => {
      const record = bySeq.get(v.seq_ref);
      if (record) record.delivered_s = t_s;
    },
  });

  for (const s of scenario.steps) if (!s.after) schedule(plant, toPlantAction(s.at_s, s.action));
  const stepsPerSecond = Math.round(1 / plant.dt_s);
  let end_s = scenario.end_s;
  let critical_s: number | null = null;
  let contact = plant.relay.contact;
  out.timeline.push(row(plant, firmware.view()));

  // Inclusive end: the step starting at end_s runs, so the window that closes at end_s is sent.
  while (plant.t_s < end_s + plant.dt_s / 2) {
    stepPlant(plant, firmware);
    out.events.push(...plant.events.splice(0));
    for (const e of firmware.drainEvents()) {
      out.events.push(e);
      if (e.type === 'CRITICAL' && critical_s === null) {
        critical_s = e.t_s;
        for (const s of scenario.steps) if (s.after) schedule(plant, toPlantAction(e.t_s + s.at_s, s.action));
        if (scenario.endAfterCritical_s !== undefined) end_s = Math.min(end_s, e.t_s + scenario.endAfterCritical_s);
      }
    }
    if (plant.relay.contact !== contact) {
      contact = plant.relay.contact;
      out.events.push({ t_s: plant.t_s, type: contact === 'NO' ? 'RELAY_CLOSED' : 'RELAY_OPEN' });
    }
    if (plant.step % stepsPerSecond === 0) out.timeline.push(row(plant, firmware.view()));
  }
  out.logs.push(...firmware.drainLogs());
  return out;
}
