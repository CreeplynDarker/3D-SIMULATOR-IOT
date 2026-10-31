# PROGRESS.md

Legend: `[ ]` todo · `[~]` in progress (add your agent name) · `[x]` done. Add one line under a task when you tick
it: `2026-11-02 · what changed · tuning (if any)`. Specs live in `docs/PLAN.md` §11.

## P0 — Setup and contracts (deps: none)

- [x] P0.1 Scaffold
  2026-10-29 · Vite 8 + React 19 + Tailwind 4 scaffold, Vitest in vite.config.ts, ESLint guards for rules 3–4, Playwright config, build test · no tuning
- [x] P0.2 Docs (deps: P0.1)
  2026-10-29 · seeded docs kept; tests/unit/docs.test.ts checks every §11 task ID is listed here · no tuning
- [x] P0.3 Config and units (deps: P0.1)
  2026-10-29 · src/shared/config.ts copied verbatim from §5.1; units.ts (rpm↔rad/s, g↔m/s², g0 = 9.80665) · no tuning
- [x] P0.4 RNG (deps: P0.1)
  2026-10-29 · shared/rng.ts: sfc32 seeded from (seed, FNV-1a(name)), 15 warm-up rounds, Box–Muller normal with cached spare · no tuning
- [x] P0.5 Protocol (deps: P0.3)
  2026-10-29 · shared/protocol.ts verbatim from §10.1 + inferred types; scripts/export-schema.ts; public/schema/*.schema.json generated · no tuning
- [x] P0.6 Workers and messages (deps: P0.5)
  2026-10-29 · shared/messages.ts (§10.2 unions + Snapshot), sim/rcf worker stubs, MessageChannel wiring + window.__pdm in App.tsx; e2e ping/pong and packet→verdict pass · no tuning
- [x] P0.7 Store skeleton (deps: P0.5)
  2026-10-29 · store/index.ts + slices sim, series, console, model, ui, testlog; store/ring.ts ring buffer (drops oldest past capacity) · no tuning

## P1 — 3D bench scene (deps: P0)

- [x] P1.1 Component catalogue and anchors
  2026-10-30 · shared/components.ts (§13.2 + breadboard grid), shared/wiring.ts data, scene/anchors.ts; nudged ds18b20/adapter/esp32 (D-020) · no tuning
- [x] P1.2 Models (deps: P1.1)
  2026-10-30 · procedural part lists for all 14 parts (bboxes within 5%), photo crops in public/textures (gen:textures), canvas breadboard/screen · no tuning
- [x] P1.3 Layout (deps: P1.2)
  2026-10-30 · scene/Bench.tsx places all parts + fan stand on a 0.90 × 0.45 m bench; App shows the viewport; e2e scene test (no console errors); laptop x 0.42 → 0.40 · no tuning
- [x] P1.4 Wires (deps: P1.1, P1.3)
  2026-10-30 · W01–W29 as 0.8 mm tubes routed by scene/wires/route.ts, USB cable, dashed Wi-Fi arc; wiring.test.ts exact list + auto collision/overshoot checks · no tuning
- [x] P1.5 Cameras and selection (deps: P1.3)
  2026-10-30 · scene/cameras.ts (5 presets, 600 ms ease), rig + hover outline + click select in Bench.tsx, cam-* buttons; e2e on GPU Chromium; MPU wires routed along the frame · no tuning
- [x] P1.6 Look (deps: P1.3)
  2026-10-30 · scene/Look.tsx: key+fill lights, frozen 2048² shadow map, Lightformer environment, contact shadows, dark/light themes; LED halos; box highlight for hover/selection; no EffectComposer (D-027); 60 fps vsync / ~150 uncapped on Iris Xe at 1080p; screenshots in docs/screenshots/ · no tuning

## P2 — Plant (deps: P0)

- [x] P2.1 Fan
  2026-10-30 · sim/fan.ts (§6.1): 3,800 RPM / 0.180 A at 12 V, friction 0.3 → −7.5% RPM and ≈ 0.26 A, coast-down ≈ 9.1 s · no tuning
- [x] P2.2 Thermal
  2026-10-30 · sim/thermal.ts (§6.2): warm start 34.072 °C, overheat 1.0 steady state 69.07 °C, 63% rise 179.9 s · no tuning
- [x] P2.3 Faults
  2026-10-30 · sim/faults.ts (§6.9): steps, linear ramps from the current value, clearAll, FAULT_SET per change (clearAll emits one with detail "clearAll") · no tuning
- [x] P2.4 Sensors (deps: P2.1)
  2026-10-30 · sim/sensors/: MPU6050 DLPF + noise + quantise/clip, ACS712, divider + ADC with INL, DS18B20 lag/85/−127/0.75 s timing, tach 2 edges/rev · no tuning
- [x] P2.5 Relay and supply
  2026-10-30 · sim/relay.ts (LOW = coil on, NO after 10 ms continuous, NC 5 ms after release), sim/supply.ts (sag, fan on NO2) · no tuning
- [x] P2.6 Plant integration (deps: P2.1–P2.5)
  2026-10-30 · sim/plant.ts (§6.10 order, Controller, scheduled actions, snapshot) + sim/vibration.ts (§6.3): healthy a_RMS 0.1205 g, imbalance 0.3 g ×5.17 with I_RMS ±0.000%, 600 s in 0.70 s; sim coverage 99% · no tuning
- [x] P2.7 Sim worker (deps: P2.6)
  2026-10-30 · sim/worker.ts paces the plant (4 ms ticks, carried debt, 0.2 s cap → lagging), snapshots ≤ 60 Hz, faults/commands/raw; stand-in firmware until P3.6; App routes worker output to the store; e2e 9.95× at 10×, pause stops the clock · no tuning

## P3 — Firmware mirror (deps: P2.6)

- [x] P3.1 Sampler
  2026-10-30 · firmware/sampler.ts: 1 kHz window buffers (two sets, alternating), DS18B20 request/read at +0.75 s, PCNT edges per window; firmware coverage threshold on · no tuning
- [x] P3.2 Features (deps: P3.1)
  2026-10-30 · firmware/features.ts (a_RMS, per-axis CF, I_RMS, rpm, validity, OLS dT/dt) + gen-fixtures.ts + features_reference.py; 5 fixtures match NumPy within 1e-6 · no tuning
- [x] P3.3 Limits and flags (deps: P3.2)
  2026-10-30 · firmware/limits.ts: I_MAX (run + start limit), T_MAX, STALL, I_SOFT, T_SOFT, SENSOR, LINK; one truth-table test per row · no tuning
- [x] P3.4 State machine (deps: P3.3)
  2026-10-30 · firmware/stateMachine.ts: §7.4 as a 15-row table + transition(); one test per spec row, GPIO26 LOW only in STARTING/NORMAL/WARNING, 4+1 vs 5 alerts, dropped verdict, refusals · no tuning
- [x] P3.5 Link
  2026-10-30 · firmware/link.ts: seeded loss + latency 20 ± 10 ms, late RCF answers held until arrival; link_lost at +6 s with loss 1.0, cleared by the next verdict · no tuning
- [x] P3.6 Firmware orchestrator and logs (deps: P3.1–P3.5)
  2026-10-30 · firmware/firmware.ts + logger.ts; healthy 60 s run → 60 valid packets, OFF→CALIBRATING→STARTING→NORMAL, required logs; ESTOP → contacts open ≤ 20 ms; worker now runs the real firmware · no tuning
- [x] P3.7 Reference C++ (deps: P3.6)
  2026-10-30 · reference-cpp/{main,features,state_machine,relay}.cpp with all 24 @map ids once each; parity test against TS and PLAN §7.6 · no tuning

## P4 — RCF and harness (deps: P3.6)

- [x] P4.1 RRCF
  2026-10-31 · rcf/rrcf.ts: RCTree class (insert/forget/codisp/query, duplicates share a leaf, parent links); property test of 1,000 ops checks n, exact boxes and cuts; rcf/ coverage threshold on · no tuning
- [x] P4.2 Normalise
  2026-10-31 · rcf/normalise.ts: fitNormaliser (μ, population σ), floorsFor, normalise with max(σ, floor); NumPy fixture matches to 1e-12 · no tuning
- [x] P4.3 Model (deps: P4.1, P4.2)
  2026-10-31 · rcf/model.ts: fitModel (μ/σ, 40 trees, holdout validation), scorePacket → Verdict (score = mean CoDisp ÷ nTrain, dominant, z map), zod-checked JSON, loadModel, trainer for the §9.3 flow · no tuning
- [ ] P4.4 RCF worker (deps: P4.3, P0.6)
- [~] P4.5 Harness, scenarios and default model (deps: P4.3) — BLOCKED (claude): S8 trips again after RESET (CRITICAL at 101.0 s); see the session report. S1–S7 and the harness tests pass.
- [ ] P4.6 Python cross-check (deps: P4.5)

## P5 — Interface modules (deps: P1, P4)

- [ ] P5.1 Shell and layout
- [ ] P5.2 M2 top bar
- [ ] P5.3 M3 status
- [ ] P5.4 M4 faults
- [ ] P5.5 M5 operator
- [ ] P5.6 M6 charts
- [ ] P5.7 M7 console and exports
- [ ] P5.8 M9 inspector
- [ ] P5.9 M10 test log
- [ ] P5.10 M12 legend
- [ ] P5.G Phase gate (deps: P5.1–P5.10)

## P6 — Animation and explanation (deps: P5)

- [ ] P6.1 Blades and vibration
- [ ] P6.2 Signal flow
- [ ] P6.3 Relay
- [ ] P6.4 Heat and sound
- [ ] P6.5 M8 code panel
- [ ] P6.6 M11 guided scenarios

## P7 — Verification and delivery (deps: P6)

- [ ] P7.1 Tests
- [ ] P7.2 Performance
- [ ] P7.3 Copy
- [ ] P7.4 Publish

## P8 — Live bridge, optional (deps: P7)

- [ ] P8.1 Python bridge
- [ ] P8.2 Live mode
- [ ] P8.3 Replay
- [ ] P8.4 Calibration

## Waiting for human review

List every `[human]` check here with its task ID, so a person can sign it off.

- P1.2 · each part is recognisable next to its photo in `assets/photos/`
- P1.3 · the layout reads like a tidy lab bench
- P1.4 · no wire passes through a component (also covered by `tests/unit/scene/route.test.ts`)
- P3.7 · the C++ in `src/firmware/reference-cpp/` reads as plausible ESP32 Arduino code
- P1.6 · at least 50 fps at 1920 × 1080 on an integrated-graphics laptop (measured 60 fps vsync-locked on Intel Iris Xe in headless Chromium; confirm in a normal browser window on the team laptop)
