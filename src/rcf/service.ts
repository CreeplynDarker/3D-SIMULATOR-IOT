// RCF service: the laptop logic behind the RCF worker (spec §9.3, §10.2) as a pure object. It holds the model and
// its status, answers every packet with a verdict, and runs the live training flow. The worker only wires messages.
import type { ModelStatus } from '../shared/messages.ts';
import type { Packet, Verdict } from '../shared/protocol.ts';
import type { SimConfig } from '../sim/types.ts';
import { createTrainer, loadModel, parseModelJson, type RcfModel, scorePacket, type Trainer, trainerAdd } from './model.ts'; // prettier-ignore

/** Model status as the `modelStatus` message carries it; `progress` is 0…1. */
export interface StatusMsg {
  status: ModelStatus;
  progress: number;
  reason?: string;
}

export interface RcfService {
  status(): StatusMsg;
  /** Loads model JSON text: READY, or UNTRAINED with the reason it was rejected. */
  load(text: string): StatusMsg;
  /** Starts live training (§9.3); scoring pauses until it ends. */
  train(): StatusMsg;
  /** Sets the alert threshold on the normalised score (unitless). */
  setThreshold(x: number): void;
  /** The verdict for one packet, plus a status change when this packet moved training on. */
  packet(packet: Packet): { verdict: Verdict; status: StatusMsg | null };
}

const LIVE_SOURCE = 'live training (btn-train)';

/** An RCF with no model (UNTRAINED) using `cfg` for training and verdict rules. */
export function createRcfService(cfg: SimConfig): RcfService {
  let model: RcfModel | null = null;
  let trainer: Trainer | null = null;
  let threshold = cfg.rcf.threshold;
  let current: StatusMsg = { status: 'UNTRAINED', progress: 0 };

  const set = (s: StatusMsg) => (current = s);

  const trainStep = (packet: Packet): StatusMsg | null => {
    if (trainer === null) return null;
    const step = trainerAdd(trainer, packet, cfg, cfg.seed, LIVE_SOURCE);
    if (step.kind === 'collecting') {
      return step.progress === current.progress ? null : set({ status: 'TRAINING', progress: step.progress });
    }
    trainer = null;
    if (step.kind === 'aborted') return set({ status: 'UNTRAINED', progress: 0, reason: `training aborted: ${step.reason}` }); // prettier-ignore
    if (step.result.status === 'UNTRAINED')
      return set({ status: 'UNTRAINED', progress: 0, reason: step.result.reason });
    model = step.result.model;
    model.threshold = threshold;
    return set({ status: 'READY', progress: 1 });
  };

  return {
    status: () => current,
    load(text) {
      try {
        model = loadModel(parseModelJson(text));
      } catch (err) {
        model = null;
        return set({ status: 'UNTRAINED', progress: 0, reason: `model rejected: ${(err as Error).message}` });
      }
      trainer = null;
      threshold = model.threshold;
      return set({ status: 'READY', progress: 1 });
    },
    train() {
      model = null;
      trainer = createTrainer(cfg);
      return set({ status: 'TRAINING', progress: 0 });
    },
    setThreshold(x) {
      threshold = x;
      if (model) model.threshold = x;
    },
    packet(packet) {
      const status = trainStep(packet);
      const verdict = scorePacket(model, packet, cfg, current.status);
      return { verdict: model ? verdict : { ...verdict, threshold }, status };
    },
  };
}
