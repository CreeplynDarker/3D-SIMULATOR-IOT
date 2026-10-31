# DECISIONS.md

Append-only. Format: `D-NNN · date · decision · why · affects`.

- **D-001 · 2026-10-29 · Fan is the Delta AFB0712HB-F00, not the AFB0812SH in the report.** Confirmed by the team
  from the label: 70 × 70 × 15 mm, 3,800 RPM, 0.18 A typical, 3 wires (tach, no PWM). Affects §1.2, §6.1, §13.2.
- **D-002 · 2026-10-29 · Relay is the 2-channel module with 5 VDC coils; only CH2 is used (CH1 dead).** The fan is
  wired on NO2 (fail-safe), the JD-VCC jumper is removed, JD-VCC = 5 V and VCC = 3V3. Affects §1.2, §6.8, §13.3.
- **D-003 · 2026-10-29 · The laptop sends a verdict per window; the ESP32 owns persistence, limits and the relay.**
  Follows slide 13 of the project deck. It replaces the earlier draft where the laptop sent STOP. Affects §7.4, §10.1.
- **D-004 · 2026-10-29 · RCF score = mean CoDisp ÷ nTrain, with a fixed threshold of 0.5.** In a Python prototype, a
  threshold taken from the holdout max (×1.25) gave 57 false alerts in 600 healthy windows. The normalised score kept
  healthy windows ≤ 0.37 and faults at 0.55–0.95. Affects §9.3.
- **D-005 · 2026-10-29 · Crest factor is computed per axis, and the maximum is used.** A rotating imbalance has a
  constant vector magnitude, so the crest factor of the magnitude stays near 1. Affects §7.2.
- **D-006 · 2026-10-29 · RPM from the tach is a 6th RCF feature (OPEN-1, pending team confirmation).** Friction
  shows more clearly in RPM than in the ~30-count ACS712 signal. Switchable via `rcf.features`.
- **D-007 · 2026-10-29 · Warm start by default.** Thermal settling takes about 9 minutes; starting at the
  thermal steady state keeps the baseline stationary for training and for demos.
- **D-008 · 2026-10-29 · TypeScript pinned at 6.0.3, not 7.x.** typescript-eslint 8.71 supports TypeScript < 6.1.
- **D-009 · 2026-10-29 · All dependency versions were published at least two weeks before the plan date.**
- **D-010 · 2026-10-29 · Added type-only dev dependencies `@types/react` 19.3.0, `@types/react-dom` 19.3.0 and
  `@types/node` 22.20.5.** React 19 and Node ship no bundled types; these are the latest versions published before
  2026-10-15 for React 19 and Node 22. No runtime code. Affects `package.json`.
- **D-011 · 2026-10-29 · `scripts/*.ts` run with Node 22's built-in type stripping (`node scripts/x.ts`), not `tsx`.**
  Avoids a dependency. Consequences: relative imports carry the `.ts` extension (`allowImportingTsExtensions`), and
  `erasableSyntaxOnly` + `verbatimModuleSyntax` are on (no TS enums or namespaces, `import type` for types).
  Affects `tsconfig.json`, every import.
- **D-012 · 2026-10-29 · `pnpm lint` is ESLint only; Prettier runs through `pnpm format`.** `src/shared/config.ts` is
  in `.prettierignore` so it stays verbatim from §5.1. Affects `package.json`, `.prettierignore`.
- **D-013 · 2026-10-29 · `pnpm gen:schema` writes `public/schema/{packet,verdict,command}.schema.json` (JSON Schema
  2020-12 from `z.toJSONSchema`) and takes an optional output directory, so the test writes to a temp folder.**
  `src/shared/protocol.ts` is kept verbatim from §10.1 (and in `.prettierignore`); `z.infer` types share each schema's
  name. Affects `scripts/export-schema.ts`, `public/schema/`.
- **D-014 · 2026-10-29 · Worker messages add what §10.2 implies but doesn't name.** (a) `connect{port}` from main to
  each worker hands over its end of the "Wi-Fi" MessageChannel. (b) The RCF worker also answers `ping{id}` with
  `pong{id}`, because P0.6 requires a ping round trip for both workers. (c) `Snapshot` carries `lagging` (the pacing
  flag in §10.2), and `faults` is the full §6.9 key set. Messages are plain objects discriminated by `type`; the
  `Packet`/`Verdict`/`Command` shapes are untouched, so `PROTOCOL_VERSION` stays 1. Affects `shared/messages.ts`.
- **D-015 · 2026-10-29 · Until P2.7/P4.4, the worker stubs echo through the channel.** On `play` the sim stub sends one
  zero packet over the channel (and copies it to main); the RCF stub validates it with `Packet` and answers an
  unscored `UNTRAINED` verdict, which the sim forwards to main as `verdictIn`. `App.tsx` exposes
  `window.__pdm` (ping, play and the messages seen) only with `?debug=1`, like `window.__sim` in §8.2, for the e2e
  tests. Affects `sim/worker.ts`, `rcf/worker.ts`,
  `App.tsx`.
- **D-016 · 2026-10-29 · Store shape.** A vanilla zustand store (`createAppStore`, the `appStore` singleton and a
  `useAppStore(selector)` hook), with one namespace per slice (`state.sim`, `state.series`, …) so action names can't
  collide. Ring buffers (`store/ring.ts`) are mutable for speed; their slices bump a `rev` counter on every change,
  and that is what components subscribe to. `series` keeps one ring of 600 window rows (packet values joined with
  their verdict by `seq`) that all six M6 strips read, plus a ring of events for markers; 600 comes from
  `max(ui.chartWindows_s) / firmware.window_s`. Affects `src/store/`.
- **D-017 · 2026-10-29 · UI defaults not fixed by the plan:** camera `overview`; toggles flow and labels on, airflow
  and heat off; vibration exaggeration 10× (clamped to the 1–50 range of `sld-vib-exaggeration`); dock tab charts;
  theme dark. P5 may change them. Affects `store/slices/ui.ts`.
- **D-018 · 2026-10-30 · `Verdict.z` is `z.partialRecord(FeatureKey, …)`, and it holds exactly the keys in
  `rcf.features`.** In zod 4, `z.record` with an enum key requires every key, so a model built without `rpm`
  (OPEN-1 keeps the feature list switchable) would produce verdicts that fail to parse. `partialRecord` still rejects
  unknown keys. **Exception to AGENTS.md rule 5:** `PROTOCOL_VERSION` stays 1, because no build has shipped and no
  fixtures exist yet. Schemas regenerated. Affects `shared/protocol.ts`, `public/schema/verdict.schema.json`,
  PLAN §9.3 and §10.1.
- **D-019 · 2026-10-30 · OPEN-1 closed: RPM stays the 6th RCF feature (team decision).** This confirms D-006 and
  the default in §2. `rcf.features` is unchanged, and the feature list stays switchable in config (D-018 keeps
  verdicts valid either way). Affects PLAN §2.
- **D-020 · 2026-10-30 · §13.2 positions nudged (all within the ±0.02 m allowed by §13.1).** `ds18b20` z −0.060 →
  −0.061 (at −0.060 its box overlapped the fan frame by 0.5 mm); `adapter` y 0.0225 → 0.015 so its 30 mm-high
  box rests on the bench; `esp32` x 0.020 → 0.01952 to sit on the breadboard's 2.54 mm grid. The probe's
  "Ø6 × 50" box is 50 × 6 × 6 mm (long axis x). The laptop gets a height of 220 mm (the plan gives only its footprint),
  and its stored y is the box centre (0.11) rather than §13.2's bench-level 0. The laptop moves from x 0.42 to
  0.40, because at 0.42 its rotated back corner hung 6 cm off the bench edge. Affects `shared/components.ts`.
- **D-021 · 2026-10-30 · Breadboard and ESP32 placement follow the team's photos.** Column 1 is at +x and rows a–e
  are on −z (the photo turned so the ESP32's antenna points +x). The left rail (−z) has + outside, and the right
  rail has + inside. The rails are 10 groups of 5 holes. `bb.node.*` are columns 30 (dq), 25 (tach), 20 (divTop) and
  17 (divMid), clear of the ESP32. The ESP32's header rows sit in rows b and i (22.86 mm apart, the closest grid fit
  to the board), with EN/D23 in column 37. Its 28 mm board covers rows a and j, so wires attach at the ESP32 pins.
  `esp32.GND` is the left-column GND; the right-column one is `esp32.GND2`. Affects `shared/components.ts`,
  `scene/anchors.ts`.
- **D-022 · 2026-10-30 · Module orientation from the photos.** Relay CH1 (the X-marked cube) is at −x, header A
  (JD-VCC, VCC, GND) at −x, and header B (GND, IN1, IN2, VCC) at +x. The terminal clamps open toward −z, with
  NO–COM–NC per OPEN-5. The ACS712 header runs Vcc, Out, Gnd from −z to +z, and IP+ is the −z clamp (not visible in
  the photo). The GY-521 holes are on its +z edge. `shared/wiring.ts` is written in P1.1, because P1.1's test needs
  it; P1.4 adds the exact-list test. Affects `scene/anchors.ts`, `shared/wiring.ts`.
- **D-023 · 2026-10-30 · Relay terminal order: OPEN-5 default kept, but the team's board disagrees.** With the
  terminals facing away (left = −x), the default NO–COM–NC puts NO on the −x side of each block, and the anchors
  follow it. The silkscreen on `assets/photos/relay-closeup.png` (printed upside-down, to be read from the terminal
  side) reads NC1 COM1 NO1 NC2 COM2 NO2 from −x to +x, which is the reverse order. The photo texture therefore labels
  the terminals differently from the anchors until the team closes OPEN-5. Affects `scene/anchors.ts` (`RELAY_DIMS`).
- **D-024 · 2026-10-30 · Procedural models are part lists in mm; textures are cropped with Playwright.** Each model
  is a list of boxes/cylinders/discs/frames (`scene/models/geometry.ts`) that Vitest measures in Node and
  `Parts.tsx` merges into one mesh per material. `pnpm gen:textures` (`scripts/crop-textures.ts`) crops and rotates
  the team's photos into `public/textures/*.jpg` (about 300 kB in total) using the Playwright Chromium already
  installed, so no image library is added. The breadboard top and the laptop screen are drawn on canvases at run
  time, so the holes line up with the anchors. The fan stand, fan leads, probe cable and coil, and resistor leads are
  drawn outside the §13.2 bounding boxes. The ESP32's 13 mm height includes 6.5 mm of exposed pins, because its
  §13.2 box sits just above the breadboard. Affects `scene/models/`, `scripts/crop-textures.ts`, `package.json`.
- **D-025 · 2026-10-30 · Wires are routed by rule, not hand-placed.** Each wire leaves its anchor along the anchor's
  exit direction (10 mm, or 8 mm straight up from a hole or pin). It rises to a travel height of 8 mm over the
  tallest part it crosses, clamped to 10–30 mm, and walks around parts taller than 27 mm (fan, adapter, laptop).
  Shoulder points keep the centripetal Catmull–Rom curve from overshooting. A breadboard end takes the free hole
  nearest the other end; holes used by or covered by a resistor are excluded, and no two wires share a hole. Two
  extra unit tests back the [human] check: no rendered wire enters a component box other than its own two ends, and
  no curve rises more than 2 mm above its travel height. The USB cable has hand-placed via points around the front of
  the breadboard. The Wi-Fi arc is a dashed quadratic Bézier 0.14 m above the screen top. Affects
  `scene/wires/route.ts`.
- **D-026 · 2026-10-30 · Camera presets and selection.** The five `cam-*` buttons sit at the top-right of the
  viewport, set `ui.camera`, and a rig eases the camera and orbit target there over 600 ms (ease-in-out cubic). The
  relay preset looks from behind and to the right, because its terminals face −z. Hovering a component outlines it
  (postprocessing `Outline`), clicking selects it (`ui.selectedId`), and clicking empty space clears the selection.
  The MPU6050 wires run along the top of the fan frame and leave past its +x side (`exit_mm` points on their
  anchors), so they don't hang across the fan's outlet face. The e2e tests use the full Chromium build
  (`channel: 'chromium'`, new headless), which renders with the machine's GPU, and run one at a time. The default
  headless shell renders WebGL in software (SwiftShader), which pushed the worker ping round trip over 50 ms. On a
  CI runner without a GPU, the ping test may need the scene paused. Affects `scene/cameras.ts`, `scene/Bench.tsx`,
  `playwright.config.ts`.
- **D-027 · 2026-10-30 · No post-processing pass; LED glow and selection are drawn in the scene.** Measured on this
  laptop's Intel Iris Xe at 1920 × 1080 in Chromium (uncapped): 154 fps without an `EffectComposer`, 52–67 fps with
  one (Outline + Bloom, MSAA 2–4×), and 46–51 fps with vsync on. That fails the P1.6 target of ≥ 50 fps. The
  composer's own render targets cost about 10 ms a frame, whichever effects it holds. So the LEDs glow with an
  additive halo sprite (emissive LED material plus a radial-gradient sprite), and a hovered or selected part shows
  its §13.2 box as edges over a faint fill (white for hover, sky-blue for selected). drei `Outlines` was tried and
  drew stray edges across merged meshes. The canvas uses native MSAA, the device-pixel ratio is capped at 1.5, and
  the shadow map is drawn for the first 3 frames and then frozen, because the bench is static. P6 must set
  `gl.shadowMap.needsUpdate` when a shadow-casting part moves. Result: 60 fps vsync-locked on every preset, about
  150 fps uncapped. Lighting is a key and a fill directional light, a Lightformer environment (nothing is fetched)
  and contact shadows. The dark and light themes follow `ui.theme`. `@react-three/postprocessing` and
  `postprocessing` stay installed (pinned in §3) but are unused. Affects `scene/Look.tsx`, `scene/Bench.tsx`,
  `scene/models/Parts.tsx`, `scene/models/materials.ts`.
- **D-028 · 2026-10-30 · OPEN-5 closed: relay terminals run NC–COM–NO from left to right (team decision, confirmed
  with a continuity test).** With the terminals facing away (left = −x), each block reads NC, COM, NO, matching the
  board's silkscreen. This replaces the earlier default (NO–COM–NC) and resolves D-023: the 3D anchors now agree
  with the photo texture. CH2 terminals are now nc2 −x, com2 middle, no2 +x; W03 (COM2) and W04 (NO2) are unchanged
  in the wire list and follow the moved anchors. W04 now leaves NO2 at the +x end and turns back toward the fan,
  so the router keeps a rise point unless a lead is within 1 mm of travel height (it was 4 mm); otherwise the curve
  bulged 2 mm. Affects `scene/anchors.ts` (`RELAY_DIMS`), `scene/wires/route.ts`, PLAN §1.5 and §2.
- **D-029 · 2026-10-30 · Plant code style: plain state objects mutated by `step*` functions, config passed in.**
  Each model exposes `create*()` and `step*(state, cfg, inputs…, dt_s)`, which mutates the state, so a 2 kHz step
  allocates nothing. The config is a parameter typed `SimConfig` (`Config` with its literal types widened,
  `sim/types.ts`), so tests and the worker's `init{config}` can pass a tuned copy. The fan keeps both the mean
  current (`current_A`, which drives the thermal model and `power_W`) and the instantaneous current with ripple
  (`currentInst_A`, which the ACS712 sees). GPIO levels are `0 | 1`, with `GPIO_LOW = 0` (relay IN2 is active
  LOW). Affects `src/sim/`.
- **D-030 · 2026-10-30 · Formula constants that §6 fixes stay in `sim/` as named constants.** §6.5's ADC
  nonlinearity uses a 3.1 V period, and §6.3 uses fixed shape factors (0.3 and 0.2 on the blade-pass and axial
  terms, a π/4 phase). They are part of the normative equations, not §5.2 tunables, and `config.ts` must stay
  verbatim (§5.1). So each becomes a named, commented constant beside its formula (`ADC_INL_PERIOD_V`,
  `VIB_SHAPE`), which keeps AGENTS.md rule 1's intent: no unexplained numbers. Noise samples are drawn by the
  caller and passed in (`acs712Out_V(i, cfg, noise_V)`, `adcCounts(v, cfg, noise_counts)`), so the noiseless
  checks pass 0. Before its first conversion completes, the DS18B20 register holds the power-on value 85 °C. A new
  reading is signalled by the `readings` counter. Affects `sim/sensors/`, `sim/vibration.ts`.
- **D-031 · 2026-10-30 · Plant integration contract.** `plant.ts` runs §6.10 in order. It talks to the firmware
  through a `Controller`: `tick(view)` is called on every 1 kHz sample with the sensor outputs at the end of the
  previous step and returns GPIO26; `command(cmd)` receives operator commands at their scheduled time; `afterStep(t)`
  covers step 4, link delivery. Scheduled work is data (`PlantAction`: fault, clearFaults, command), applied in time
  order at the start of the matching step. Sim time is `step · dt_s`, never a running sum, so it can't drift. RNG
  streams are `plant` (vibration phases and looseness noise), `mpu`, `acs` and `adc`, as in §6.10. The MPU's DLPF
  starts at the resting 1 g. `toSnapshot(plant, firmwareView)` builds the §10.2 snapshot; until P3 the firmware
  fields read OFF. `vibration.ts` (§6.3) arrives with P2.6, because no task lists it and P2.6's a_RMS check needs
  it. The "600 s in < 3 s in Node" test times the plant in a child `node` process, so it measures plain Node rather
  than Vitest's coverage-instrumented copy (0.70 s plain, about 4.6 s instrumented). Coverage now has a per-folder
  80% threshold for `src/sim/` in addition to the global one. Affects `sim/plant.ts`, `sim/vibration.ts`,
  `vite.config.ts`.
- **D-032 · 2026-10-30 · The sim worker paces the real plant; the firmware is a stand-in until P3.6.** Every 4 ms
  wall tick adds `elapsed · speed` to a carried sim-time debt and runs whole steps against it, so the clock does not
  drift from rounding. More than 0.2 s owed in one tick is capped and sets `lagging`. Snapshots go out at most
  `snapshotHz` (60/s) and on pause, reset and init. Faults, `clearFaults` and commands are scheduled at the current
  sim time and apply on the next step. `raw{on}` streams the 1 kHz MPU samples as transferable `Float32Array`s with
  each snapshot. Until P3.6 two stand-ins remain: a minimal controller where START drives GPIO26 LOW and RESET or
  ESTOP drive it HIGH, and a zero placeholder packet once per sim second over the Wi-Fi channel, which keeps the
  P0.6 channel check meaningful (D-015). `scenario{id}` logs that scenarios arrive in P4.5. The message types in
  `shared/messages.ts` are unchanged. `App.tsx` sends `init`, routes snapshots, packets, events, logs and verdicts
  into the store, and adds `pause`, `setSpeed`, `command` and `snapshot` to the debug-only `window.__pdm`.
  Measured on this laptop: 9.95× at 10×, 3.99× at 4×, 1.00× at 1×, never lagging. Affects `sim/worker.ts`,
  `App.tsx`.
- **D-033 · 2026-10-30 · Feature fixtures and the NumPy cross-check.** `pnpm gen:fixtures`
  (`scripts/gen-fixtures.ts`) runs the plant with a minimal firmware: calibrate 0.5 s with the relay open, then fan
  on, with the fault set from t = 0. It captures window 20, a steady window with ≥ 10 readings for dT/dt. Each
  fixture stores the raw window (accelerometer in integer LSB, ADC counts, PCNT edges), counts0, the valid DS18B20
  readings and the config values the features use. `scripts/features_reference.py` recomputes the features with
  NumPy (`polyfit` for dT/dt) and writes them into `reference`, so the Python never hard-codes the config. On this
  machine `python3` (3.11) has no NumPy; the reference was run with `py -3.12` (NumPy 2.4.4); `python3 -m pip install
  numpy` makes the AGENTS.md command work as written. `t_C` is the last valid reading since boot (§7.2 says "last
  valid reading", with no age limit); staleness shows up as `sensor_fault` (§7.3). The power-on 85 °C is rejected
  only as the very first reading after boot. Affects `firmware/features.ts`, `scripts/`, `tests/fixtures/`.
- **D-034 · 2026-10-30 · Reading of §7.3's limits.** "Running" means STARTING, NORMAL or WARNING (the fan is
  powered); the link timer restarts at START, so time spent OFF never counts as loss. Soft conditions (I_SOFT, T_SOFT,
  SENSOR) are computed in every state, because WARNING needs them to hold back `clearRun`; only NORMAL turns them
  into a transition. When several trips hold in one window, the first in table order wins (I_MAX, T_MAX, STALL), and
  likewise for soft conditions. T_MAX uses the last valid reading, so a disconnected probe cannot trip it with −127.
  Affects `firmware/limits.ts`.
- **D-035 · 2026-10-30 · §7.4 as a table.** `TRANSITIONS` is data (from-states, trigger, guard, to, action, `@map`
  id), and `transition()` fires the first matching row. Rows that the spec combines are split so each `@map` id has
  exactly one row. The trip rows are split by reason (`sm.limit.imax` and `sm.limit.tmax` cover STARTING, NORMAL and
  WARNING; `sm.limit.stall` covers NORMAL and WARNING). `sm.warn.alert` is the implied row "WARNING + alert, but
  `alertRun` still below `nCritical`": it stays in WARNING and emits ALERT. Verdict counters update before the table
  is matched, and only in NORMAL and WARNING, so verdicts in STARTING, OFF, CALIBRATING and CRITICAL change nothing.
  ESTOP in CRITICAL re-trips with reason ESTOP ("any except OFF"). `activeMap` is the id of the last row that fired;
  the `relay.on` and `relay.off` markers sit on the GPIO26 writes inside those rows' actions. A trip logs
  `ERR trip <reason>`, and the firmware adds the feature values (§7.7). Affects `firmware/stateMachine.ts`.
- **D-036 · 2026-10-30 · Link model.** Each uplink packet draws two numbers from the `link` stream, the loss decision
  and the latency jitter, even when it is dropped, so the random sequence doesn't depend on `packetLoss`. A sent
  packet records its nominal verdict time (window end + `latency_s` + U(−jitter, +jitter)). A verdict is delivered at
  that time, or when it reaches the firmware if the RCF answers later. A verdict with no packet on record is delivered
  on arrival. The firmware pulls due verdicts in `afterStep(t)`, so delivery has 0.5 ms resolution. Measured: delays
  of 10–30 ms; with `packetLoss` 1.0 from t = 30 s, `link_lost` is raised at the 36 s window end (5 s timeout + 1
  window) and cleared by the first verdict after restore. Affects `firmware/link.ts`.
- **D-037 · 2026-10-30 · The firmware is the plant's Controller; one input added at the integration edge.**
  `createFirmware()` implements D-031's `Controller` (`tick`, `command`, `afterStep`) unchanged. It reads only the
  sensor view, its own clock, received verdicts and commands. The plant is untouched. The one addition is
  `FirmwareOptions.packetLoss: () => number`: the link model (§7.5) needs the "Wi-Fi" packet-loss fault, which
  belongs to the environment, not to anything the ESP32 measures. The worker and the tests pass
  `() => plant.faults.values.packetLoss`. The other options are `uplink(packet)` (the transport to the RCF) and
  `receiveVerdict(v, now_s)` (verdicts entering the link). Until the first calibration, `counts0` is the datasheet
  zero (2.5 V through the divider). A trip's ERR line gets the last window's features appended
  (`trip RCF a_rms=… cf=… i_rms=… t=… rpm=…`). Log modules are `fsm`, `fw` and `link`. In the worker, the stand-in
  controller and the zero placeholder packet (D-032) are gone: real packets go to the RCF stub over the channel and
  copies go to main, and verdicts from the stub enter the firmware's link. The worker emits `RELAY_OPEN` and
  `RELAY_CLOSED` when the plant's contact changes, because the firmware cannot sense the contact. Affects
  `firmware/firmware.ts`, `firmware/logger.ts`, `sim/worker.ts`.
- **D-038 · 2026-10-30 · Reference C++ layout.** Four files for ESP32 Arduino core 3.x, meant for reading.
  `main.cpp` holds the pins, `setup()` (Wire for the MPU6050 with DLPF 184 Hz and ±2 g, DallasTemperature in
  non-blocking mode at 12 bits, ADC 11 dB on GPIO34, the IDF 5 `pulse_cnt` driver on GPIO27, a 1 kHz `esp_timer`,
  UDP and ArduinoJson for packets and verdicts), the window-end limits (`link.lost`), the calibration and grace
  timers, and `loop()`. `features.cpp` has the `feat.*` markers, `state_machine.cpp` the `sm.*` markers, and
  `relay.cpp` `relay.on`/`relay.off`. Each of the 24 §7.6 ids appears exactly once in the TS firmware and once in
  the C++; `tests/unit/firmware/mapMarkers.test.ts` checks both against PLAN §7.6. There is no shared header, so
  each file declares what it uses from the others (`extern`, forward declarations), which keeps the set at the four
  files the plan lists. Affects `src/firmware/reference-cpp/`.
- **D-039 · 2026-10-31 · Normalisation keeps the raw σ and the floor separately.** `rcf/normalise.ts` fits μ and
  the population σ (ddof = 0) and divides by `max(σ, stdFloor)` at use, so a saved model can report the measured
  spread of each feature. `tests/fixtures/normalise.json` holds 120 six-column rows drawn with NumPy
  (`default_rng(20261029)`; the dT/dt column is constant, so its floor applies) and NumPy's mean and std; the TS fit
  matches to 1e-12 relative. The fixture is static, so the test needs no Python. Affects `rcf/normalise.ts`,
  `tests/fixtures/normalise.json`.
- **D-040 · 2026-10-31 · RCF model details that §9.3 leaves open.** (a) The saved model adds `numTrees` and
  `stdFloor` to the §9.3 fields, so loading never depends on the current config; `std` is the raw population σ
  (D-039). It is not a protocol shape, so `PROTOCOL_VERSION` is unchanged. (b) Scoring draws cuts from each tree's
  `rcf-tree-<i>` stream, as Python `rrcf` does, so a score depends on the packets scored before it. To keep "train →
  serialise → load" bit-for-bit, `fitModel` validates the holdout on a probe forest and returns a forest rebuilt from
  the saved JSON, which is exactly what a load gives. (c) Every packet gets a verdict; packets outside
  NORMAL/WARNING, with a null feature, or with no model get `score = null`, `alert = clear = false`. The firmware
  needs these: its link timer runs in STARTING too (D-034). (d) The trainer waits for the first NORMAL packet,
  skips packets with a null feature, and aborts (`state left NORMAL (<state>)`) when a later packet isn't NORMAL.
  (e) `clear` uses `firmware.clearHysteresis`, the only hysteresis key in §5.1. Affects `rcf/model.ts`.
- **D-041 · 2026-10-31 · The default model is trained on a healthy run with one stop and restart (team decision,
  changes PLAN §9.4).** Trained on the warm-start steady state alone (windows 16…195), t_C sat at 34.0625 °C and
  dT/dt at exactly 0, so both had zero spread. After S8's 20 s stop the probe reads ~0.7 °C cooler with dT/dt
  ≈ −0.8 °C/min (z ≈ −7 and −15), the RCF alerts on every window, and the fan trips again at 101.0 s, 4.5 s after
  NORMAL. No §5.2 setting fixed this at threshold 0.5. The only passing set (threshold 0.70, t_C and dT/dt floors
  3×, nCritical 6) passed only with the canonical seed: 4 of 5 other seeds tripped again. The same would happen in
  the demo after every RESET → START. The run in `DEFAULT_TRAINING` (ESTOP 100 s, RESET 120 s, START 121 s, the
  same off time as S8) gives t_C σ 0.32 °C and dT/dt σ 0.38 °C/min, holdout max 0.171. With it every S1–S8 row
  passes at the §5.1 defaults; seeds 1–5 all pass S8, with S1 max 0.16–0.39 and S5 CRITICAL at 75–78 s. Cost:
  overheat is caught later (S5 69 → 76 s). Live retraining (`btn-train`, §9.3) is unchanged. No tuning. Affects
  `harness/trainDefault.ts`, `shared/scenarios.ts`, `public/models/default-model.json`, PLAN §9.4.
- **D-042 · 2026-10-31 · Harness details (§10.4).** (a) `FirmwareOptions` gains an optional
  `onVerdictDelivered(verdict, t_s)` tap, so the harness can record when the link delivers each verdict (S6: "no
  verdict delivered after 30.1 s"). The firmware's logic is unchanged and the workers don't use it. (b) The RCF
  scores each uplink packet synchronously, and the verdict enters `receiveVerdict(v, now_s)` at the window end, so
  the link alone sets the delivery time (D-036). Each run loads a fresh forest from the model JSON, because scoring
  advances the trees' streams (D-040). (c) `verdicts` are `{ sent_s, delivered_s, verdict }`. `packets` holds only
  the packets that reached the RCF, so the per-second `timeline` also carries the firmware's state, `linkLost`,
  `sensorFault` and `tripReason`. (d) The end is inclusive: the step at `end_s` runs, so the window closing at
  `end_s` is sent. (e) Steps with `after: 'CRITICAL'` are scheduled when the first CRITICAL event appears, and
  `endAfterCritical_s` ends S8 at +45. (f) `RELAY_OPEN`/`RELAY_CLOSED` come from the plant's contact, as in the sim
  worker. (g) P4.5 went before P4.4, because the worker's e2e check loads the model P4.5 generates.
  (h) The `rcf_dataset.json` fixture in `gen:fixtures` arrives with P4.6, the task that uses it. Affects
  `harness/runScenario.ts`, `firmware/firmware.ts`.
- **D-043 · 2026-10-31 · RCF worker (P4.4).** The logic is a pure `rcf/service.ts` (unit-tested); `rcf/worker.ts`
  only wires messages. Main fetches `./models/default-model.json` (the app's own static file, relative to the page
  so `base: './'` works; no external service, like the textures) and sends it with the existing `loadModel{json}`,
  which answers `modelStatus` READY or UNTRAINED with a reason. Every packet gets a verdict (D-040). `train` drops
  the current model, reports TRAINING with progress n/180 on every collected window, and ends READY, or UNTRAINED
  with `training aborted: …` or `baseline unstable`. Main logs an UNTRAINED reason to the console as `WARN rcf: …`
  (§9.3's "log WARN"; the RCF worker has no log message). `setThreshold` applies to the current and any later
  model. The `model-status` element is M5 (P5.5), so the e2e check reads the store's model slice through the
  debug API (`modelStatus()`, `verdictLatencies_ms()`, `train()`). Building the forest blocks the worker once at
  boot (30–40 ms in Node, about 2.6 s cold in a GPU-less container), so the RCF ping test waits for READY.
  `playwright.config.ts` takes an optional `PW_CHROMIUM_PATH` for a preinstalled Chromium when the pinned
  Playwright's own build is missing. Messages in `shared/messages.ts` are unchanged. Affects `rcf/service.ts`,
  `rcf/worker.ts`, `App.tsx`, `tests/e2e/`, `playwright.config.ts`.
- **D-044 · 2026-10-31 · Python rrcf cross-check (P4.6).** `pnpm gen:fixtures` also writes
  `tests/fixtures/rcf_dataset.json` from harness runs with no RCF scoring. Training is 120 healthy windows
  (16…135). The test set is 20 healthy windows (136…155) plus windows 61…70 after a t = 60 s step of imbalance 0.3,
  looseness 0.6, friction 0.3 or overheat 1.0. Friction is 0.3 rather than §12's 0.5, so the current stays under
  I_SOFT and the windows stay NORMAL. `scripts/rrcf_reference.py` normalises as §9.2 does, builds 40
  `rrcf.RCTree(random_state=seed + i)` trees and scores as §9.3 does. Its RNG differs from the TS `rcf-tree-<i>`
  streams, so the check compares ranks, not values. Measured Spearman: 0.944. The test always checks the stored
  reference. When a Python with rrcf 0.4.4 is found (`RRCF_PYTHON`, else `python3`), it also re-runs the script on a
  copy and matches the stored scores to 1e-9. On Debian/Ubuntu `pip install rrcf==0.4.4` fails against the system
  setuptools, and rrcf 0.4.4 needs `pkg_resources`; a venv works: `python3 -m venv .venv && .venv/bin/pip install
  numpy rrcf==0.4.4 "setuptools<81"`, then `RRCF_PYTHON=.venv/bin/python`. Regenerating the fixtures here gave
  byte-identical feature windows; only the NumPy dT/dt reference on the constant-temperature windows moved within
  1e-13 of 0, so those files were left as committed. Affects `scripts/gen-fixtures.ts`, `scripts/rrcf_reference.py`,
  `tests/fixtures/rcf_dataset.json`.
- **D-045 · 2026-10-31 · App shell (P5.1).** `ui/layout/AppShell.tsx` is a CSS grid on Tailwind's `xl` breakpoint,
  which is exactly 1280 px. From 1280 px up it shows the §8.1 grid (48 px top bar, 320 px left, viewport, 340 px
  right, dock below). Below that the page is one column: top bar, viewport (60 vh), left column, right column, dock,
  so the side columns stack under the viewport. The dock height is dragged by the user, so it is applied through a
  `--dock-h` CSS variable set from the store in an effect, the same exception AGENTS.md makes for computed overlay
  positions. It is clamped to 160–480 px in the store. Extra test IDs, beyond §8.2, for layout checks only:
  `app-shell`, `region-topbar|left|viewport|right|dock`, `dock-tab-charts|console|code|testlog` and `dock-resize`.
  The M1 view toggles (`tgl-flow`, `tgl-labels`, `tgl-airflow`, `tgl-heat`) and `sld-vib-exaggeration` sit on the
  viewport's bottom-right with P5.1, because no P5 task names M1; they only set `ui.toggles`/`ui.vibExaggeration`,
  and P6 draws what they enable. Dark mode is a `dark` class on the shell (`@custom-variant dark` in
  `index.css`), driven by `ui.theme`. Components send worker messages only through `ui/actions.ts`, which App binds
  to the workers. The e2e tests read the store through `window.__pdm.inspect()` (`ui/debug.ts`), which grows with
  each module. Affects `src/ui/`, `App.tsx`, `store/slices/ui.ts`, `index.css`.
- **D-046 · 2026-10-31 · Top bar and scenario playback (P5.2).** (a) The worker's `scenario{id}` handler schedules
  the script's steps as plant actions from the current sim time. Steps with `after: 'CRITICAL'` are scheduled when
  the first CRITICAL event comes through the worker's event flush, which is timed from that event's own `t_s`. At
  the script's end the worker pauses. The logic is in `sim/script.ts` (`startScript`, `scriptEvent`, `scriptDone`),
  which the harness now uses as well, so there is no second copy; the S1–S8 results and the default model are
  unchanged. (b) `sel-scenario` resets the sim first (`reset`, charts cleared), then sends `scenario{id}` and plays,
  so a script starts from OFF at t = 0 as §12 assumes, and S9 also sets 10×. (c) `shared/messages.ts` gains
  `SimToMain { type: 'scenario'; id; done }`, so main knows when a script has ended (`window.__sim.scenarioDone`,
  §8.2). Worker messages aren't the §10.1 protocol, so `PROTOCOL_VERSION` stays 1. (d) `fps` comes from an
  `FpsProbe` in the canvas that writes `ui.fps` every 500 ms. (e) `btn-sim-reset` keeps the play state. `btn-help`
  sets `ui.legendOpen`; the modal itself is M12 (P5.10). The mode label is an extra test ID, `mode-label`. `sel-mode`
  is disabled until P8. (f) With `?debug=1`, `window.__sim` exposes live getters for `fps`, `state`, `t_s`,
  `scenarioDone` and `lastEvent` (the newest series event), and `__pdm.events()` returns the series events.
  Affects `sim/script.ts`, `sim/worker.ts`, `harness/runScenario.ts`, `shared/messages.ts`, `ui/TopBar.tsx`,
  `ui/actions.ts`, `scene/Bench.tsx`, `store/slices/{sim,ui}.ts`.
- **D-047 · 2026-10-31 · Fault panel (P5.4).** The M4 controls keep what the operator asked for in `ui.faultTargets`;
  each row shows the plant's live value from the snapshot (extra test IDs `val-imbalance|looseness|friction|overheat|sag|loss`
  and `val-ds-disconnect`). Sliders use the `CONFIG.faults` ranges and send `fault{key, value, ramp_s}` on every
  change. With `tgl-ramp` on, numeric faults ramp over `inp-ramp-s` seconds of sim time (default 30 s, S4's ramp;
  negative values clamp to 0). The DS18B20 switch always steps. `btn-clear-faults` and `btn-sim-reset` zero the
  targets. Affects `ui/FaultPanel.tsx`, `ui/actions.ts`, `store/slices/ui.ts`.
- **D-048 · 2026-10-31 · Operator panel (P5.5).** (a) The enable rules are pure functions in `ui/rules.ts`. `btn-start`
  is enabled in OFF. `btn-reset` is enabled in CRITICAL; it opens `dlg-reset-confirm`, and `btn-reset-confirm`
  sends RESET (`btn-reset-cancel` is an extra test ID). The firmware still refuses a RESET while the fan turns.
  `btn-train` is enabled in NORMAL with every fault off and the last window's |dT/dt| ≤ `warmDtdtMax_C_per_min`. A
  null dT/dt (fewer than 10 readings) counts as not settled. `btn-estop` is enabled in every state but OFF ("any
  except OFF", §7.4). One consequence: a warm-started motor that sits OFF while the sim plays cools down, so TRAIN
  stays disabled until dT/dt settles. (b) `inp-n-critical`, `inp-i-max` and `inp-t-max` apply to the running
  firmware at once. The new `MainToSim` message `params{nCritical, iMax_A, tMax_C}` edits the worker's own copy of
  the config, which the firmware reads live, so the snapshot's `nCritical` (and so `persistence`) follow. To
  carry an edited config, `init.config` is now typed `SimConfig`. (c) `tgl-warm-start` applies at the next
  `btn-sim-reset`, which now sends `init` with the §5.1 config plus the operator's limits and warm start, rather
  than `reset`. (d) `inp-threshold` sends `setThreshold` to the RCF and updates the model slice. (e)
  `latched-indicator` (extra test ID) reads LATCHED in CRITICAL. (f) Input ranges: threshold 0.05–1, N 1–20,
  I_MAX 0.05–1 A, T_MAX 20–100 °C. They are UI bounds, not §5.2 tuning. Affects `ui/OperatorPanel.tsx`,
  `ui/rules.ts`, `ui/actions.ts`, `shared/messages.ts`, `sim/worker.ts`, `store/slices/ui.ts`.
- **D-049 · 2026-10-31 · Live charts (P5.6).** `ui/chartData.ts` (pure, unit-tested) cuts the series slice to the
  chart window and lays it out as uPlot columns. Every strip shares an x range that ends at the newest window. It
  also builds state bands (consecutive windows in the same state, §8.1 colours) and event markers (FAULT_SET,
  WARNING, CRITICAL, RELAY_OPEN, RESET, LINK_LOST, SENSOR_FAULT). `ui/Charts.tsx` builds six uPlot instances, one
  per strip, in a 3 × 2 grid. They share the cursor sync key `m6`, and every strip reserves the same right-hand
  gutter (the temperature strip uses it for dT/dt), so the plot areas and cursors line up. Bands are drawn in
  `drawClear`, markers in `draw`, and the score strip shows its threshold as a dashed line. React renders the frame
  once and re-renders only when the window, freeze or theme changes. A `store.subscribe` on `series.rev` calls
  `setData` directly, and a ResizeObserver keeps the plots sized. Each strip's element carries `data-points` and
  `data-last-t` for the e2e tests. The chart window takes only the `ui.chartWindows_s` values (default 120 s).
  Affects `ui/Charts.tsx`, `ui/chartData.ts`, `store/slices/ui.ts`.
- **D-050 · 2026-10-31 · Data console and exports (P5.7).** Main appends a console line for every uplink packet
  (from the sim's packet copy) and every verdict as the ESP32 received it (`verdictIn`), as well as commands and log
  lines. The formats are in `ui/consoleFormat.ts`. A verdict line ends in ALERT, clear, hold (neither) or unscored,
  then `dom=`. The ring keeps `ui.consoleMaxLines`; the view shows the newest 400 that pass the `flt-*` filters.
  `btn-console-pause` freezes the view while lines keep arriving, and `btn-console-copy` copies the visible lines.
  Clicking a line shows its JSON. `btn-export-csv` writes the §8.2 columns: the `Packet` fields in protocol order,
  then `score, threshold, alert, clear, dominant` from the verdict with the same seq, empty when there is none. There
  is one row per console packet. `btn-export-json` writes `{ packets, verdicts, commands, logs }`. Downloads use an
  object URL; nothing is sent anywhere. `btn-sim-reset` and `sel-scenario` clear the console, because seq restarts at
  0 and a join by seq would mix two runs. `tgl-raw-mpu` sends `raw{on}`; the console header counts the 1 kHz samples
  and shows the newest x/y/z (extra test ID `raw-mpu`). Extra test IDs: `console-line` (with `data-kind`) and
  `console-json`. Affects `ui/Console.tsx`, `ui/consoleFormat.ts`, `ui/download.ts`, `store/slices/{console,sim}.ts`,
  `App.tsx`.
- **D-051 · 2026-10-31 · Inspector (P5.8).** `ui/inspectorData.ts` holds, for each of the 14 parts, the key specs
  (from §1.2/§1.3 and §5.1), the photo crop where `public/textures/` has one (fan, ESP32, ACS712, relay, adapter;
  the others show none), and live pin lines formatted from the snapshot. The ACS712 line is the §8.2 example,
  `ACS712 OUT 2.533 V → GPIO34 1965 counts`; the laptop shows the model status and last score. "Its wires" means the
  §13.3 wires on the part's anchors; for resistors, the wires on their two breadboard holes' nodes; for the
  breadboard, every `bb.*` wire. Each wire shows its colour swatch and net. The adapter and jack show the sag fault
  and the fan-side voltage instead of computing a supply voltage, because the UI computes nothing physical. Extra test
  ID: `inspector-pin`. The debug API gains `select(id)`. Affects `ui/Inspector.tsx`, `ui/inspectorData.ts`.
- **D-052 · 2026-10-31 · Test log (P5.9).** `btn-run-start` opens a run at the current sim time, named after the
  scenario being played or, otherwise, `manual:` and the injected faults. While it is open, each event updates it
  through `ui/testlog.ts` (`runPatch`, pure). The first ALERT sets alerted and the time to first alert, counted from
  the run's start. The first CRITICAL and the next RELAY_OPEN give the delay in ms. A RESET counts as reset by
  operator (the firmware emits RESET only for an accepted operator RESET). `btn-run-stop` sets the duration.
  `inp-run-notes` edits the open run, or the last one. `btn-testlog-export` saves the table as CSV. The test-log
  slice gains `active` and each run a `critical_s`. To keep CRITICAL ahead of its RELAY_OPEN in main, the sim worker
  now posts each tick's plant, firmware and relay events together, sorted by sim time; before this, relay events
  went out while the tick was still stepping. Extra test ID: `testlog-row`. Affects `ui/TestLog.tsx`,
  `ui/testlog.ts`, `store/slices/testlog.ts`, `sim/worker.ts`, `App.tsx`.
- **D-053 · 2026-10-31 · Legend and shortcuts (P5.10).** `legend-modal` shows the §13.3 colour key (11 swatches
  from `WIRE_COLORS`), the six §8.1 state colours, the shortcut list and the §14 glossary verbatim
  (`ui/legend.ts`). It closes with `btn-legend-close`, Escape or a click outside. The §8.2 keys are handled by one
  window listener (`useShortcuts`): Space play/pause, S START, E ESTOP, R opens the reset confirmation (only in
  CRITICAL), 1–5 the camera presets in `CAMERA_ORDER`, ? the legend, and Escape closes either dialog. Keys typed into
  inputs, selects or text areas, or pressed with Ctrl/Alt/Meta, are ignored. They go through the same `actions` as
  the buttons, so S and R follow the same rules. Extra test IDs: `btn-legend-close`, `legend-wire`,
  `legend-state`. Affects `ui/Legend.tsx`, `ui/legend.ts`, `App.tsx`.
- **D-054 · 2026-10-31 · P5 phase gate.** `tests/e2e/p5-gate.spec.ts` drives only the real controls: `sel-speed` 4×,
  `btn-start`, `btn-play`, `sld-imbalance` 0.3, `btn-reset` → `btn-reset-confirm`, then `btn-export-csv` from the
  console tab. `window.__pdm`/`__sim` are used only to wait (NORMAL, rpm < 100 before the reset) and to read the
  FAULT_SET and CRITICAL event times. Sim time from setting the imbalance to CRITICAL is taken from those events and
  must be ≤ 15 s; the badge must show CRITICAL by the next snapshot. The sim is paused before exporting, so the
  CSV's rows can be compared with the console's packet count. Measured here: CRITICAL 4.35 s of sim time after the
  slider, trip reason RCF, 57 CSV rows = 57 console packets. M8 (code panel, P6.5) and M11 (guided card, P6.6)
  are not part of P5; their test IDs (`code-panel`, `tab-code-*`, `tgl-follow`, `scenario-card`, `btn-scn-*`)
  arrive with P6. Affects `tests/e2e/p5-gate.spec.ts`.
- **D-055 · 2026-10-31 · Fixes from the P5 screenshot review.** (a) In CRITICAL every window is unscored, so M3's gauge
  and `dominant-var` went blank exactly when the operator needs the cause. The model slice now also keeps
  `lastScored`, the newest verdict with a score, and M3 shows that; a sim reset clears both. (b) uPlot stretches a
  flat series from 0 (T at 34.06 °C read as 0–50), so each strip's y range is `yRange`: 10 % padding, or ±0.5 around a
  flat line. (c) `camera.spec.ts` clicked (5, 5) to hit empty canvas, which assumed a full-page viewport; it now
  clicks the viewport's own corner. Screenshots of OFF, NORMAL, WARNING (DS18B20 disconnected) and CRITICAL
  (imbalance) at 1920 × 1080 and 1280 × 720 are in `docs/screenshots/p5/`. Affects `store/slices/model.ts`,
  `ui/StatusPanel.tsx`, `ui/chartData.ts`, `ui/Charts.tsx`, `tests/e2e/camera.spec.ts`.
- **D-056 · 2026-10-31 · Chart redraws are coalesced to one per animation frame.** A store change schedules a
  `requestAnimationFrame` instead of redrawing all six plots inside the packet message handler. On the GPU-less
  container the main thread draws at 4–5 fps in software. There, the P4.4 e2e check (packet copy → verdict on main
  < 20 ms) failed one run in two with 106–122 ms, because the main thread was busy between the two messages, not
  the RCF (0.17 ms per packet in Node). The worker ping and sim-rate checks fail there for the same reason (D-026).
  They need a rerun on a machine with a GPU. Affects `ui/Charts.tsx`.
- **D-057 · 2026-10-31 · Fan motion (P6.1).** `scene/models/FanMotion.tsx` wraps the fan model. In `useFrame` it reads
  the snapshot and the last window's a_RMS from the store; every motion is a pure function of sim values
  (`scene/anim.ts`), so a paused sim redraws the same frame. (a) The blades turn by `theta_rad`. Above
  `bladeBlurRpm` they fade out while a dark translucent ring (the blur disc) fades in, linearly up to 2 ×
  `bladeBlurRpm`. (b) The frame moves on a circle of radius min(`vibVisualMax_mm`, a_RMS · `vibVisual_mm_per_g` ·
  exaggeration) at `vibVisual_Hz`, with its phase from sim time; it holds still when the fan is stopped. (c)
  `tgl-airflow` shows 10 glow streaks leaving the outlet, their speed proportional to rpm. Airflow is drawn here
  because no other task owns it. (d) Shadows: the blades, the disc and the streaks don't cast, so the frozen
  shadow map (D-027) stays valid without a redraw. The fan frame keeps casting from its rest pose; the jitter (at
  most 4 mm) isn't reflected in its shadow. (e) `vib-slowed-label` (extra test ID) says "Fan vibration slowed for
  visibility: shown at 6 Hz, ×N" while the Fan camera is active or the fan is selected. (f) `window.__scene.anim()`
  returns what the animated parts drew last frame, for the e2e tests. Affects `scene/anim.ts`,
  `scene/animDebug.ts`, `scene/models/FanMotion.tsx`, `scene/Bench.tsx`, `ui/ViewportControls.tsx`.
