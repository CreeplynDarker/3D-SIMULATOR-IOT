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
