// Default model (spec §9.4): warm start, START at t = 0, train on windows 16…195 (after calibration, grace and 5 s of
// settling) with seed CONFIG.seed, through the same trainer the RCF worker uses.
import { createTrainer, type FitResult, trainerAdd } from '../rcf/model.ts';
import type { Scenario } from '../shared/scenarios.ts';
import type { SimConfig } from '../sim/types.ts';
import { runScenario } from './runScenario.ts';

/** First training window (§9.4): 0.5 s calibration + 10 s grace + 5 s settling, rounded up to a window. */
export const DEFAULT_FIRST_WINDOW = 16;

/** Trains the default model on a healthy run of the plant and firmware (no RCF answers are scored). */
export function trainDefault(cfg: SimConfig, seed: number = cfg.seed): FitResult {
  const windows = cfg.rcf.nTrain + cfg.rcf.nHoldout;
  const last = DEFAULT_FIRST_WINDOW + windows - 1;
  const healthy: Scenario = {
    id: 'train-default',
    title: 'healthy run for the default model',
    guided: false,
    end_s: (last + 1) * cfg.firmware.window_s,
    steps: [{ at_s: 0, action: { kind: 'command', cmd: 'START' } }],
  };
  const { packets } = runScenario(healthy, { seed, config: cfg, model: null });
  const source = `harness/trainDefault: warm start, seed ${seed}, windows ${DEFAULT_FIRST_WINDOW}-${last}`;
  const trainer = createTrainer(cfg);
  for (const p of packets.filter((x) => x.seq >= DEFAULT_FIRST_WINDOW && x.seq <= last)) {
    const step = trainerAdd(trainer, p, cfg, seed, source);
    if (step.kind === 'done') return step.result;
    if (step.kind === 'aborted') return { status: 'UNTRAINED', model: null, holdoutMax: 0, reason: step.reason };
  }
  return { status: 'UNTRAINED', model: null, holdoutMax: 0, reason: 'not enough healthy windows' };
}
