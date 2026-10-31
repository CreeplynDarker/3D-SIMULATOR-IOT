// Default model (spec §9.4, D-041): a healthy warm-start run with one stop and restart, seed CONFIG.seed. The steady
// windows before the stop and the windows after the restart are interleaved and fed to the trainer the RCF worker
// uses, so a restart's thermal transient is part of the baseline.
import { createTrainer, type FitResult, trainerAdd } from '../rcf/model.ts';
import type { Packet } from '../shared/protocol.ts';
import { DEFAULT_TRAINING } from '../shared/scenarios.ts';
import type { SimConfig } from '../sim/types.ts';
import { runScenario } from './runScenario.ts';

const untrained = (reason: string): FitResult => ({ status: 'UNTRAINED', model: null, holdoutMax: 0, reason });

/** Steady and post-restart NORMAL packets, alternating, from a healthy run (window start times in s). */
function trainingPackets(cfg: SimConfig, seed: number): Packet[] | null {
  const { scenario, firstWindow } = DEFAULT_TRAINING;
  const r = runScenario(scenario, { seed, config: cfg, model: null });
  const restart_s = r.events.filter((e) => e.type === 'NORMAL')[1]?.t_s;
  if (restart_s === undefined) return null;
  const start_s = (p: Packet) => p.seq * cfg.firmware.window_s;
  const normal = r.packets.filter((p) => p.state === 'NORMAL');
  const steady = normal.filter((p) => p.seq >= firstWindow && start_s(p) < restart_s);
  const post = normal.filter((p) => start_s(p) >= restart_s);
  const out: Packet[] = [];
  for (let i = 0; i < Math.max(steady.length, post.length); i++) {
    for (const p of [steady[i], post[i]]) if (p) out.push(p);
  }
  return out;
}

/** Trains the default model; UNTRAINED if the run has no restart, too few windows, or an unstable holdout. */
export function trainDefault(cfg: SimConfig, seed: number = cfg.seed): FitResult {
  const packets = trainingPackets(cfg, seed);
  if (packets === null) return untrained('no restart in the training run');
  const source = `harness/trainDefault: warm start, seed ${seed}, steady windows from ${DEFAULT_TRAINING.firstWindow} interleaved with post-restart windows`; // prettier-ignore
  const trainer = createTrainer(cfg);
  for (const p of packets) {
    const step = trainerAdd(trainer, p, cfg, seed, source);
    if (step.kind === 'done') return step.result;
  }
  return untrained('not enough healthy windows');
}
