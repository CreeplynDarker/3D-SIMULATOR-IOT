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
