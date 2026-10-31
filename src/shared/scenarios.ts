// Scenarios (spec §12) as data. All use the default model, warm start and seed CONFIG.seed, with START at t = 0.
// Times are sim time in s; a step with `after: 'CRITICAL'` is timed from the first CRITICAL event.
import type { FaultKey } from './messages.ts';
import type { Command } from './protocol.ts';

export type ScenarioAction =
  | { kind: 'fault'; key: FaultKey; value: number | boolean; ramp_s: number }
  | { kind: 'clearFaults' }
  | { kind: 'command'; cmd: Command['cmd'] };

export interface ScenarioStep {
  /** Sim time of the step (s), or its offset from the first CRITICAL when `after` is set. */
  at_s: number;
  after?: 'CRITICAL';
  action: ScenarioAction;
}

export interface Scenario {
  id: string;
  title: string;
  /** Offered as a guided scenario in M11. */
  guided: boolean;
  /** End of the run (s); with `endAfterCritical_s`, the run ends that long after the first CRITICAL if earlier. */
  end_s: number;
  endAfterCritical_s?: number;
  steps: ScenarioStep[];
  /** UI playback speed (S9 only). */
  speed?: number;
}

const START: ScenarioStep = { at_s: 0, action: { kind: 'command', cmd: 'START' } };
const fault = (at_s: number, key: FaultKey, value: number | boolean, ramp_s = 0): ScenarioStep => ({
  at_s,
  action: { kind: 'fault', key, value, ramp_s },
});
const afterCritical = (at_s: number, action: ScenarioAction): ScenarioStep => ({ at_s, after: 'CRITICAL', action });

export const SCENARIOS: readonly Scenario[] = [
  { id: 'S1', title: 'baseline', guided: true, end_s: 600, steps: [START] },
  { id: 'S2', title: 'imbalance', guided: true, end_s: 120, steps: [START, fault(60, 'imbalance_g', 0.3)] },
  { id: 'S3', title: 'looseness', guided: false, end_s: 120, steps: [START, fault(60, 'looseness', 0.6)] },
  { id: 'S4', title: 'friction', guided: true, end_s: 140, steps: [START, fault(60, 'friction', 0.5, 30)] },
  { id: 'S5', title: 'overheat', guided: true, end_s: 140, steps: [START, fault(60, 'overheat', 1.0)] },
  {
    id: 'S6',
    title: 'wifi-loss',
    guided: true,
    end_s: 420,
    steps: [START, fault(30, 'packetLoss', 1.0), fault(60, 'overheat', 1.0)],
  },
  { id: 'S7', title: 'sensor', guided: false, end_s: 300, steps: [START, fault(60, 'ds18b20Disconnect', true)] },
  {
    id: 'S8',
    title: 'reset-flow',
    guided: false,
    end_s: 600,
    endAfterCritical_s: 45,
    steps: [
      START,
      fault(60, 'imbalance_g', 0.3),
      afterCritical(1, { kind: 'command', cmd: 'START' }),
      afterCritical(5, { kind: 'clearFaults' }),
      afterCritical(20, { kind: 'command', cmd: 'RESET' }),
      afterCritical(21, { kind: 'command', cmd: 'START' }),
    ],
  },
  { id: 'S9', title: 'false-alarm', guided: true, end_s: 600, steps: [START], speed: 10 },
];

/** The scenario with this id; throws if there is none. */
export function scenarioById(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown scenario ${id}`);
  return s;
}
