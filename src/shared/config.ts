export const CONFIG = {
  seed: 20261029,
  physics: { dt_s: 0.0005 },                          // 2 kHz plant step
  fan: {
    rpmRated: 3800, vRated_V: 12, vStart_V: 4.0, vMax_V: 13.8,
    tauUp_s: 0.8, tauDown_s: 2.5,
    iIdle_A: 0.03, iAero_A: 0.15, iFriction_A: 0.40,  // iIdle + iAero = 0.18 A at rated
    iInrushGain_A: 0.15, iInrushMax_A: 0.33,
    iRipple_A: 0.01, rippleHarmonic: 4,
    frictionSpeedLoss: 0.25, frictionCoastFactor: 0.6,
    blades: 7, tachPulsesPerRev: 2,
    residualUnbalance_gmm: 2.0, unbalanceRadius_mm: 28, mountMass_kg: 0.25,
    bladePass_g: 0.02,
    looseGain: 1.5, looseH2: 0.5, looseH3: 0.25, looseNoise_g: 0.04,
    looseImpulseGain: 2.0, looseImpulseTau_s: 0.002, looseImpulseFreq_Hz: 300,
  },
  thermal: {
    ambient_C: 25, overheatAmbientMax_K: 35, heatFraction: 0.35,
    rTh0_KperW: 18, airflowCooling: 0.5, cTh_JperK: 15, warmStart: true,
  },
  sensors: {
    mpu: { range_g: 2, lsbPerG: 16384, noise_g: 0.007, dlpfCutoff_Hz: 184 },
    acs712: { vZero_V: 2.5, sens_VperA: 0.185, noise_V: 0.005 },
    divider: { rTop_ohm: 10000, rBottom_ohm: 20000 },
    adc: { maxCount: 4095, vMin_V: 0.075, vSpan_V: 3.05, noise_counts: 2, inl_counts: 6 },
    ds18b20: { probeTau_s: 8, resolution_C: 0.0625, conversion_s: 0.75, period_s: 1,
               disconnected_C: -127, powerOn_C: 85 },
  },
  relay: { pullIn_s: 0.010, release_s: 0.005, coil_A: 0.072 },
  supply: { v_V: 12, sagMax_V: 3 },
  link: { latency_s: 0.02, latencyJitter_s: 0.01, lossTimeout_s: 5 },
  firmware: {
    sampleRate_Hz: 1000, window_s: 1, calib_s: 0.5, startGrace_s: 10,
    dtdtSpan_s: 60, dtdtMinSamples: 10, tJumpReject_C: 10,
    iMax_A: 0.30, iMaxStart_A: 0.40, nILimit: 3,
    tMax_C: 60, tWarnMargin_C: 5, iWarnFraction: 0.9,
    stallFraction: 0.5, nStall: 3, sensorFaultTimeout_s: 10,
    nCritical: 5, nClear: 3, clearHysteresis: 0.8, resetMaxRpm: 100,
  },
  rcf: {
    features: ['a_rms_g', 'cf', 'i_rms_A', 't_C', 'dtdt_C_per_min', 'rpm'] as const,   // OPEN-1
    numTrees: 40, treeSize: 256, nTrain: 120, nHoldout: 60,
    threshold: 0.5,                    // on the normalised score (mean CoDisp / nTrain)
    holdoutMaxRatio: 0.8,              // baseline rejected if holdout max ≥ 0.8 × threshold
    warmDtdtMax_C_per_min: 0.2,
    stdFloor: { a_rms_g: 0.005, cf: 0.05, i_rms_A: 0.002, t_C: 0.1, dtdt_C_per_min: 0.05, rpm: 15 },
  },
  faults: {                            // slider ranges
    imbalance_g: { min: 0, max: 0.5, step: 0.05 },
    looseness: { min: 0, max: 1, step: 0.05 },
    friction: { min: 0, max: 1, step: 0.05 },
    overheat: { min: 0, max: 1, step: 0.05 },
    supplySag_V: { min: 0, max: 3, step: 0.1 },
    packetLoss: { min: 0, max: 1, step: 0.05 },
  },
  ui: {
    speeds: [0.25, 1, 4, 10], chartWindows_s: [30, 120, 600], chartWindowDefault_s: 120,
    consoleMaxLines: 5000, snapshotHz: 60,
    vibVisual_mm_per_g: 0.5, vibVisual_Hz: 6, vibVisualMax_mm: 4, bladeBlurRpm: 600,
  },
} as const;
export type Config = typeof CONFIG;
