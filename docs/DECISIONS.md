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
  and its stored y is the box centre (0.11) rather than §13.2's bench-level 0. Affects `shared/components.ts`.
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
