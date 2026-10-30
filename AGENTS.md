# AGENTS.md — IoT Predictive-Maintenance 3D Simulator

You are building a browser-based 3D simulator of Grupo 7's bench (UTEC, CS5055 IoT, 2026-2): a 12 V Delta
AFB0712HB fan monitored by MPU6050 (vibration), ACS712 (current) and DS18B20 (temperature) on an ESP32. A Random
Cut Forest (RCF) on the laptop scores each 1 s feature window, and a 2-channel relay (CH2) cuts the fan's 12 V on a
persistent anomaly.

**Source of truth:** `docs/PLAN.md`. If anything here, in the human-facing plan doc, or in your own memory
conflicts with `docs/PLAN.md`, `docs/PLAN.md` wins. Decisions taken during the build go in `docs/DECISIONS.md`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install --frozen-lockfile` | Install pinned deps (Node 22, pnpm 10) |
| `pnpm dev` | Dev server on http://localhost:5173 |
| `pnpm verify` | `typecheck && lint && test` — must pass before every commit |
| `pnpm test` / `pnpm test:cov` | Vitest unit + scenario tests / with coverage |
| `pnpm test:e2e` | Playwright (Chromium) against `pnpm preview` |
| `pnpm build` / `pnpm preview` | Static build to `dist/` / serve it |
| `pnpm gen:schema` | Write `public/schema/*.schema.json` from `src/shared/protocol.ts` |
| `pnpm gen:model` | Write `public/models/default-model.json` (pre-trained baseline) |
| `pnpm gen:fixtures` | Regenerate `tests/fixtures/*` from the harness |
| `python3 -I scripts/features_reference.py` | NumPy reference for feature extraction |
| `python3 -I scripts/rrcf_reference.py` | Python `rrcf` 0.4.4 reference scores |

## Work loop (one task at a time)

1. Open `docs/PROGRESS.md`. Take the first unchecked task whose dependencies are all checked.
2. Read that task in `docs/PLAN.md` §11 and every spec section it cites. Read nothing you don't need.
3. Write the tests named in its **Accept** list first. They must fail before you implement.
4. Implement. Create only the files the task lists; helpers may go in the same folder.
5. Run `pnpm verify`. Run `pnpm test:e2e` when the task is tagged `[e2e]`.
6. Tick the task in `docs/PROGRESS.md` and add one line: date, what changed, any tuning done.
7. Commit one task per commit: `P2.1: fan model (spec §6.1)`.

Parallel agents: P1 and P2–P4 are independent tracks (see §11 dependency graph). Never work on a task another agent
has marked `[~]` in `docs/PROGRESS.md`; mark yours `[~]` when you start.

## Hard rules

1. **One config.** Every tunable number lives in `src/shared/config.ts` (§5.1). No magic numbers in `sim/`,
   `firmware/`, `rcf/`, `harness/` except mathematical constants.
2. **Units in names.** Suffix every physical quantity: `_s`, `_ms`, `_Hz`, `_V`, `_A`, `_g` (acceleration in g),
   `_C`, `_K`, `_W`, `_rpm`, `_rad`, `_radps`, `_mm`, `_kg`. Example: `iRms_A`, `tMotor_C`.
3. **Deterministic core.** `sim/`, `firmware/`, `rcf/`, `harness/` never call `Math.random`, `Date.now`,
   `performance.now` or timers. Randomness comes from `src/shared/rng.ts` with an explicit seed; time is sim time.
4. **Pure core.** `sim/`, `firmware/`, `rcf/`, `harness/`, `shared/` import no React, DOM, three.js or worker
   globals. ESLint `no-restricted-imports` enforces this. Workers are thin wrappers around pure functions.
5. **Protocol is a contract.** Packet, verdict and command shapes change only in `src/shared/protocol.ts`, with a
   bump of `PROTOCOL_VERSION`, regenerated schema and fixtures, and a `docs/DECISIONS.md` entry.
6. **UI reads, never computes.** Components read the Zustand store. No physics, features or scoring in `ui/` or
   `scene/`. Every animation is driven by sim state; pausing the sim must freeze it.
7. **Test IDs.** Every interactive element carries the `data-testid` listed in §8. Don't rename them.
8. **Don't move goalposts.** Never edit an acceptance threshold. If a criterion fails, tune only the parameters
   listed in §5.2 within their ranges. Still failing → stop and report (below).
9. **Pinned deps only.** Exact versions from §3, no `^` or `~`. Adding a dependency requires a `DECISIONS.md`
   entry; prefer writing 50 lines yourself to adding a package.
10. **Firmware parity.** `src/firmware/*.ts` and `src/firmware/reference-cpp/*.cpp` express the same logic. Shared
    `// @map <id>` markers tie them together (§7.6). Change one, change the other.
11. **Not allowed:** a physics engine (Rapier, cannon), `SharedArrayBuffer` (needs COOP/COEP headers), any runtime
    network call before P8, any backend before P8, CSS frameworks other than Tailwind, chart libraries other than
    uPlot.

## Stop and ask the human when

- A task depends on an item still marked **OPEN** in `docs/PLAN.md` §2 and its default doesn't let you proceed.
- An acceptance criterion still fails after tuning within the §5.2 ranges.
- Two parts of the spec contradict each other.
- The work needs physical hardware, team photos you don't have, or a new dependency over 200 kB gzipped.

Report in this format: `BLOCKED <task id>: <one-line cause>. Tried: <what>. Need: <decision or file>.`

## Definition of done (every task)

- Every **Accept** item for the task passes. `[auto]` items pass in CI, and `[human]` items are listed in
  `PROGRESS.md` for review.
- `pnpm verify` is green and coverage for `sim/`, `firmware/`, `rcf/` hasn't dropped below 80%.
- No `any`, no `@ts-ignore`, no `console.log` outside `ui/console` and the logger.
- Public functions have a one-line JSDoc that states units.

## Style

TypeScript strict mode, ES modules, named exports, functions under ~60 lines, `const` objects over classes
except for the RRCF tree. React function components only. Tailwind utility classes; no inline style objects except
for computed 3D overlay positions.
