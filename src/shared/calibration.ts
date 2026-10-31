// Calibration (P8.4) as data: the recording the fit expects, its search settings, and the keys it fits or keeps.
import type { Scenario } from './scenarios.ts';

/**
 * The healthy recording `scripts/calibrate.ts` fits (sim time, s): fan at rest and at room temperature (cold start)
 * for 10 s, START, 600 s of running from cold, E-STOP, 30 s of coast-down and rest.
 */
export const CALIBRATION_SCENARIO: Scenario = {
  id: 'CAL',
  title: 'calibration recording',
  guided: false,
  end_s: 640,
  steps: [
    { at_s: 10, action: { kind: 'command', cmd: 'START' } },
    { at_s: 610, action: { kind: 'command', cmd: 'ESTOP' } },
  ],
};

/** Search ranges and sizes of the fit. */
export const CALIBRATION_FIT = {
  /** Spin-up and coast-down time constants searched (s). */
  fanTau_s: [0.05, 20] as const,
  /** Thermal time constant C_th · R_th searched (s). */
  thermalTau_s: [20, 20000] as const,
  /** The switching instant is searched this far either side of the window where the relay changed (s). */
  edgeSearch_s: 1,
  /** Windows fitted after each switching instant. */
  transientWindows: 8,
  /** A coasting fan counts as stopped this many coast-down time constants after the relay opened. */
  coastSettleTaus: 6,
  /** The unbalance fit runs short healthy sims: warm start, START at 0, settle, then average some windows (s). */
  vibSettle_s: 15,
  vibWindows_s: 10,
  vibIterations: 2,
  /** 1-D minimiser: grid points, then golden-section steps around the best one. */
  grid: 48,
  goldenSteps: 50,
} as const;

/** Keys the fit proposes, in report order. */
export const CALIBRATED_KEYS = [
  'fan.rpmRated',
  'fan.tauUp_s',
  'fan.tauDown_s',
  'fan.iIdle_A',
  'fan.iAero_A',
  'fan.residualUnbalance_gmm',
  'thermal.ambient_C',
  'thermal.rTh0_KperW',
  'thermal.cTh_JperK',
  'sensors.mpu.noise_g',
  'sensors.acs712.noise_V',
  'sensors.adc.noise_counts',
] as const;
export type CalibratedKey = (typeof CALIBRATED_KEYS)[number];

/** §5.2 tuning ranges for the fitted keys that have one: a proposal outside is flagged for review. */
export const TUNING_RANGES: Partial<Record<CalibratedKey, { relative?: readonly [number, number]; absolute?: readonly [number, number] }>> = {
  'sensors.mpu.noise_g': { relative: [0.5, 2] },
  'sensors.acs712.noise_V': { relative: [0.5, 2] },
  'sensors.adc.noise_counts': { relative: [0.5, 2] },
  'thermal.cTh_JperK': { absolute: [10, 30] },
}; // prettier-ignore

/** fan.* and thermal.* keys a healthy session can't separate, and why they are kept. */
export const KEPT_KEYS: readonly { keys: string; why: string }[] = [
  { keys: 'fan.vRated_V, fan.vStart_V, fan.vMax_V', why: 'the supply stays at 12 V in a recording' },
  { keys: 'fan.iInrushGain_A, fan.iInrushMax_A', why: 'the inrush is over within one 1 s window' },
  { keys: 'fan.iRipple_A, fan.rippleHarmonic', why: 'the ripple is under 0.2 % of the window RMS' },
  { keys: 'fan.iIdle_A : fan.iAero_A', why: 'only their sum at rated speed is seen, so both scale by the same factor' },
  { keys: 'fan.mountMass_kg, fan.unbalanceRadius_mm', why: 'only residualUnbalance / mountMass is seen; the unbalance absorbs it' }, // prettier-ignore
  { keys: 'fan.bladePass_g', why: 'it is under 1 % of the healthy a_RMS' },
  { keys: 'fan.friction*, fan.loose*, thermal.overheatAmbientMax_K', why: 'fault parameters: a healthy session has no fault' }, // prettier-ignore
  { keys: 'fan.blades, fan.tachPulsesPerRev', why: 'counted on the part, not fitted' },
  { keys: 'thermal.heatFraction, thermal.airflowCooling', why: 'only heatFraction · rTh0 / (1 + airflowCooling) is seen; rTh0 absorbs it' }, // prettier-ignore
  { keys: 'sensors.acs712.noise_V : sensors.adc.noise_counts', why: 'one current noise is seen, so both scale by the same factor' }, // prettier-ignore
];
