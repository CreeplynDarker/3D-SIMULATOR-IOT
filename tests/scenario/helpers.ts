// Shared helpers for the §12 scenario tests: run a scenario with the default model and summarise the result.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runScenario, type ScenarioResult } from '../../src/harness/runScenario.ts';
import { parseModelJson } from '../../src/rcf/model.ts';
import { CONFIG } from '../../src/shared/config.ts';
import type { SimEventType } from '../../src/shared/messages.ts';
import { scenarioById } from '../../src/shared/scenarios.ts';

export const DEFAULT_MODEL = parseModelJson(
  readFileSync(join(import.meta.dirname, '../../public/models/default-model.json'), 'utf8'),
);

/** Runs §12 scenario `id` with the default model, warm start and seed `CONFIG.seed`. */
export function run(id: string): ScenarioResult {
  return runScenario(scenarioById(id), { seed: CONFIG.seed, config: CONFIG, model: DEFAULT_MODEL });
}

/** The numbers the §12 rows check, read off a result (times in s of sim time). */
export function summarise(r: ScenarioResult) {
  const at = (type: SimEventType, after_s = -1) =>
    r.events.find((e) => e.type === type && e.t_s > after_s)?.t_s ?? null;
  const alerts = r.verdicts.filter((v) => v.verdict.alert);
  const first = alerts[0] ?? null;
  const critical_s = at('CRITICAL');
  const scores = r.verdicts.map((v) => v.verdict.score).filter((s): s is number => s !== null);
  return {
    at,
    alerts: alerts.length,
    firstAlert_s: first?.delivered_s ?? null,
    firstAlertDominant: first?.verdict.dominant ?? null,
    critical_s,
    criticals: r.events.filter((e) => e.type === 'CRITICAL').length,
    // From the firmware's view: with packet loss, no CRITICAL packet may reach the laptop.
    tripReason: r.timeline.find((row) => row.tripReason !== null)?.tripReason ?? null,
    relayOpen_s: critical_s === null ? null : at('RELAY_OPEN', critical_s - 1e-9),
    maxScore: scores.length > 0 ? Math.max(...scores) : null,
    finalState: r.packets.at(-1)?.state ?? null,
    /** First timeline time at or after `t0_s` when the fan is below `rpm`. */
    rpmBelow: (rpm: number, t0_s: number) => r.timeline.find((row) => row.t_s >= t0_s && row.rpm < rpm)?.t_s ?? null,
  };
}
