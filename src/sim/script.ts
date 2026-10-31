// Scenario scripts (spec §12) on a running plant: absolute steps are scheduled as plant actions at start, steps
// with `after: 'CRITICAL'` when the first CRITICAL event arrives (D-042). Used by the harness and the sim worker.
import type { SimEvent } from '../shared/messages.ts';
import type { Scenario, ScenarioAction } from '../shared/scenarios.ts';
import { type Plant, type PlantAction, schedule } from './plant.ts';

export interface ScriptRun {
  scenario: Scenario;
  /** Sim time the script started (s); step times are offsets from it. */
  t0_s: number;
  /** Sim time of the first CRITICAL event after the start (s), or null. */
  critical_s: number | null;
  /** Sim time the script ends (s). */
  end_s: number;
}

/** The plant action for a script step at sim time `at_s` (s). */
export function toPlantAction(at_s: number, a: ScenarioAction): PlantAction {
  if (a.kind === 'fault') return { at_s, kind: 'fault', key: a.key, value: a.value, ramp_s: a.ramp_s };
  if (a.kind === 'clearFaults') return { at_s, kind: 'clearFaults' };
  return { at_s, kind: 'command', cmd: a.cmd };
}

/** Starts `scenario` at sim time `t0_s` (s): schedules its absolute steps on the plant. */
export function startScript(plant: Plant, scenario: Scenario, t0_s: number): ScriptRun {
  for (const s of scenario.steps) if (!s.after) schedule(plant, toPlantAction(t0_s + s.at_s, s.action));
  return { scenario, t0_s, critical_s: null, end_s: t0_s + scenario.end_s };
}

/** Feeds one event to the script; the first CRITICAL schedules the relative steps and may bring the end forward. */
export function scriptEvent(run: ScriptRun, plant: Plant, e: SimEvent): void {
  if (e.type !== 'CRITICAL' || run.critical_s !== null || e.t_s < run.t0_s) return;
  run.critical_s = e.t_s;
  for (const s of run.scenario.steps) if (s.after) schedule(plant, toPlantAction(e.t_s + s.at_s, s.action));
  const after_s = run.scenario.endAfterCritical_s;
  if (after_s !== undefined) run.end_s = Math.min(run.end_s, e.t_s + after_s);
}

/** True once sim time `t_s` (s) has reached the script's end. */
export function scriptDone(run: ScriptRun, t_s: number): boolean {
  return t_s >= run.end_s - 1e-9;
}
