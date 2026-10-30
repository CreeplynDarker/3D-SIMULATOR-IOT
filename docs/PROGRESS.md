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
- [ ] P1.3 Layout (deps: P1.2)
- [ ] P1.4 Wires (deps: P1.1, P1.3)
- [ ] P1.5 Cameras and selection (deps: P1.3)
- [ ] P1.6 Look (deps: P1.3)

## P2 — Plant (deps: P0)

- [ ] P2.1 Fan
- [ ] P2.2 Thermal
- [ ] P2.3 Faults
- [ ] P2.4 Sensors (deps: P2.1)
- [ ] P2.5 Relay and supply
- [ ] P2.6 Plant integration (deps: P2.1–P2.5)
- [ ] P2.7 Sim worker (deps: P2.6)

## P3 — Firmware mirror (deps: P2.6)

- [ ] P3.1 Sampler
- [ ] P3.2 Features (deps: P3.1)
- [ ] P3.3 Limits and flags (deps: P3.2)
- [ ] P3.4 State machine (deps: P3.3)
- [ ] P3.5 Link
- [ ] P3.6 Firmware orchestrator and logs (deps: P3.1–P3.5)
- [ ] P3.7 Reference C++ (deps: P3.6)

## P4 — RCF and harness (deps: P3.6)

- [ ] P4.1 RRCF
- [ ] P4.2 Normalise
- [ ] P4.3 Model (deps: P4.1, P4.2)
- [ ] P4.4 RCF worker (deps: P4.3, P0.6)
- [ ] P4.5 Harness, scenarios and default model (deps: P4.3)
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
