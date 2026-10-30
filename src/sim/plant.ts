// Plant integration (spec §6.10): one call per physics step, in the spec's order, driven by a firmware `Controller`.
import type { FaultKey, SimEvent, Snapshot } from '../shared/messages.ts';
import type { Command, State, TripReason } from '../shared/protocol.ts';
import { type RngStream, stream } from '../shared/rng.ts';
import { rpmToRadps } from '../shared/units.ts';
import { createFan, type FanState, stepFan } from './fan.ts';
import { clearFaults, createFaults, type FaultState, setFault, stepFaults } from './faults.ts';
import { createRelay, type RelayState, stepRelay } from './relay.ts';
import { acs712Out_V } from './sensors/acs712.ts';
import { adcCounts, dividerOut_V } from './sensors/adc.ts';
import { createDs18b20, type Ds18b20State, stepDs18b20 } from './sensors/ds18b20.ts';
import { createMpu, filterMpu, type MpuState, sampleMpu } from './sensors/mpu6050.ts';
import { createTach, stepTach, type TachState } from './sensors/tach.ts';
import { fanSupply_V, supplyVoltage_V } from './supply.ts';
import { createThermal, stepThermal, type ThermalState } from './thermal.ts';
import { GPIO_HIGH, type GpioLevel, type SimConfig } from './types.ts';
import { createVibration, stepVibration, type VibrationState } from './vibration.ts';

/** What the firmware reads at each 1 kHz sample: sensor outputs as they stood at the end of the previous step. */
export interface SensorsView {
  /** Sim time of the sample (s). */
  t_s: number;
  /** MPU6050 sample x, y, z (g, quantised). */
  accel_g: Float64Array;
  /** GPIO34 ADC reading (counts). */
  adcCounts: number;
  /** Latest DS18B20 register (°C) and the count of completed conversions. */
  dsReading_C: number;
  dsReadings: number;
  /** Tach rising edges since start (PCNT). */
  tachEdges: number;
}

/** The firmware as seen by the plant (P3 provides the real one). */
export interface Controller {
  /** Called at every firmware sample; returns the level to drive on GPIO26. */
  tick(view: SensorsView): GpioLevel;
  /** Operator command delivered at its scheduled time. */
  command?(cmd: Command['cmd'], t_s: number): void;
  /** End of every step (§6.10 step 4: deliver due link messages). */
  afterStep?(t_s: number): void;
}

export type PlantAction =
  | { at_s: number; kind: 'fault'; key: FaultKey; value: number | boolean; ramp_s: number }
  | { at_s: number; kind: 'clearFaults' }
  | { at_s: number; kind: 'command'; cmd: Command['cmd'] };

export interface Plant {
  cfg: SimConfig;
  dt_s: number;
  /** Physics steps taken; sim time is `step · dt_s`. */
  step: number;
  t_s: number;
  stepsPerSample: number;
  gpio26: GpioLevel;
  supply_V: number;
  fan: FanState;
  thermal: ThermalState;
  vibration: VibrationState;
  mpu: MpuState;
  ds: Ds18b20State;
  tach: TachState;
  relay: RelayState;
  faults: FaultState;
  /** ACS712 output and ADC pin voltage at the latest sample (V). */
  acsOut_V: number;
  adcPin_V: number;
  view: SensorsView;
  rng: { plant: RngStream; mpu: RngStream; acs: RngStream; adc: RngStream };
  /** Pending scheduled actions, sorted by time. */
  actions: PlantAction[];
  events: SimEvent[];
}

/** A plant at t = 0: fan stopped, relay on NC, motor and probe at the warm-start (or ambient) temperature. */
export function createPlant(cfg: SimConfig, seed: number, opts: { warmStart: boolean }): Plant {
  const dt_s = cfg.physics.dt_s;
  const rng = {
    plant: stream(seed, 'plant'),
    mpu: stream(seed, 'mpu'),
    acs: stream(seed, 'acs'),
    adc: stream(seed, 'adc'),
  };
  const thermal = createThermal(cfg, opts.warmStart);
  const p: Plant = {
    cfg,
    dt_s,
    step: 0,
    t_s: 0,
    stepsPerSample: Math.round(1 / (cfg.firmware.sampleRate_Hz * dt_s)),
    gpio26: GPIO_HIGH,
    supply_V: supplyVoltage_V(cfg.supply, 0),
    fan: createFan(),
    thermal,
    vibration: createVibration(rng.plant),
    mpu: createMpu(cfg.sensors.mpu, dt_s),
    ds: createDs18b20(cfg.sensors.ds18b20, thermal.tMotor_C),
    tach: createTach(),
    relay: createRelay(),
    faults: createFaults(),
    acsOut_V: 0,
    adcPin_V: 0,
    view: { t_s: 0, accel_g: new Float64Array(3), adcCounts: 0, dsReading_C: 0, dsReadings: 0, tachEdges: 0 },
    rng,
    actions: [],
    events: [],
  };
  p.mpu.lp_g.set(p.vibration.accel_g); // the board sits still under 1 g before the first step
  return p;
}

/** Queues an action; actions at the same time run in the order they were scheduled. */
export function schedule(p: Plant, action: PlantAction): void {
  const i = p.actions.findIndex((a) => a.at_s > action.at_s);
  if (i < 0) p.actions.push(action);
  else p.actions.splice(i, 0, action);
}

/** §6.10 step 1: due actions, then fault ramps. */
function applyActions(p: Plant, controller: Controller): void {
  const emit = (e: SimEvent) => p.events.push(e);
  const eps_s = p.dt_s / 2;
  for (let a = p.actions[0]; a !== undefined && a.at_s <= p.t_s + eps_s; a = p.actions[0]) {
    p.actions.shift();
    if (a.kind === 'fault') setFault(p.faults, a.key, a.value, a.ramp_s, p.t_s, emit);
    else if (a.kind === 'clearFaults') clearFaults(p.faults, p.t_s, emit);
    else controller.command?.(a.cmd, p.t_s);
  }
  stepFaults(p.faults, p.t_s);
}

/** §6.10 step 2: sample every sensor (outputs of the previous step) and let the firmware set GPIO26. */
function sampleSensors(p: Plant, controller: Controller): void {
  const s = p.cfg.sensors;
  const v = p.view;
  v.t_s = p.t_s;
  sampleMpu(p.mpu, s.mpu, p.rng.mpu, v.accel_g);
  p.acsOut_V = acs712Out_V(p.fan.currentInst_A, s.acs712, p.rng.acs.normal(0, s.acs712.noise_V));
  p.adcPin_V = dividerOut_V(p.acsOut_V, s.divider);
  v.adcCounts = adcCounts(p.adcPin_V, s.adc, p.rng.adc.normal(0, s.adc.noise_counts));
  v.dsReading_C = p.ds.reading_C;
  v.dsReadings = p.ds.readings;
  v.tachEdges = p.tach.edges;
  p.gpio26 = controller.tick(v);
}

/** §6.10 step 3: relay → supply → fan → thermal and probe → vibration and DLPF → tach. */
function stepPhysics(p: Plant): void {
  const { cfg, dt_s } = p;
  const f = p.faults.values;
  stepRelay(p.relay, cfg.relay, p.gpio26, dt_s);
  p.supply_V = supplyVoltage_V(cfg.supply, f.supplySag_V);
  stepFan(p.fan, cfg.fan, fanSupply_V(p.relay, p.supply_V), f.friction, dt_s);
  const r = p.fan.omega_radps / rpmToRadps(cfg.fan.rpmRated);
  stepThermal(p.thermal, cfg.thermal, p.fan.voltage_V, p.fan.current_A, r, f.overheat, dt_s);
  const tEnd_s = (p.step + 1) * dt_s;
  stepDs18b20(p.ds, cfg.sensors.ds18b20, p.thermal.tMotor_C, tEnd_s, dt_s, f.ds18b20Disconnect);
  const fan = p.fan;
  stepVibration(p.vibration, cfg.fan, fan.theta_rad, fan.omega_radps, f.imbalance_g, f.looseness, p.rng.plant, dt_s);
  filterMpu(p.mpu, p.vibration.accel_g);
  stepTach(p.tach, fan.theta_rad, cfg.fan.tachPulsesPerRev);
}

/** Advances the plant by one physics step (spec §6.10). */
export function stepPlant(p: Plant, controller: Controller): void {
  applyActions(p, controller);
  if (p.step % p.stepsPerSample === 0) sampleSensors(p, controller);
  stepPhysics(p);
  p.step++;
  p.t_s = p.step * p.dt_s;
  controller.afterStep?.(p.t_s);
}

/** Runs `duration_s` of sim time (rounded to whole steps). */
export function runPlant(p: Plant, controller: Controller, duration_s: number): void {
  const n = Math.round(duration_s / p.dt_s);
  for (let k = 0; k < n; k++) stepPlant(p, controller);
}

/** Firmware fields of the snapshot; P3 fills them, the plant alone reports a firmware that is OFF. */
export interface FirmwareView {
  state: State;
  alertRun: number;
  nCritical: number;
  linkLost: boolean;
  sensorFault: boolean;
  tripReason: TripReason | null;
  activeMap: string | null;
}

const FIRMWARE_OFF: FirmwareView = {
  state: 'OFF',
  alertRun: 0,
  nCritical: 0,
  linkLost: false,
  sensorFault: false,
  tripReason: null,
  activeMap: null,
};

/** Snapshot for the UI (spec §10.2); every value is copied, so it can be posted from a worker. */
export function toSnapshot(p: Plant, fw: FirmwareView = FIRMWARE_OFF, lagging = false): Snapshot {
  const a = p.view.accel_g;
  return {
    t_s: p.t_s,
    rpm: p.fan.rpm,
    omega_radps: p.fan.omega_radps,
    theta_rad: p.fan.theta_rad,
    fanV_V: p.fan.voltage_V,
    current_A: p.fan.currentInst_A,
    tMotor_C: p.thermal.tMotor_C,
    tProbe_C: p.ds.probe_C,
    coilOn: p.relay.coilOn,
    contact: p.relay.contact,
    gpio26: p.gpio26,
    faults: { ...p.faults.values },
    accel_g: [a[0] as number, a[1] as number, a[2] as number],
    acsOut_V: p.acsOut_V,
    adcPin_V: p.adcPin_V,
    adcCounts: p.view.adcCounts,
    dsReading_C: p.ds.reading_C,
    tachHigh: p.tach.high,
    ...fw,
    lagging,
  };
}
