import type { StateCreator } from 'zustand/vanilla';
import { CONFIG } from '../../shared/config.ts';
import type { ModelStatus } from '../../shared/messages.ts';
import type { Verdict } from '../../shared/protocol.ts';
import type { AppState } from '../index.ts';

export interface ModelSlice {
  model: {
    status: ModelStatus;
    /** Training progress, 0…1. */
    progress: number;
    reason: string | null;
    /** Alert threshold on the normalised score (unitless). */
    threshold: number;
    lastVerdict: Verdict | null;
    /** The newest verdict that carried a score (kept through CRITICAL, when windows aren't scored). */
    lastScored: Verdict | null;
    setStatus(status: ModelStatus, progress: number, reason?: string): void;
    setThreshold(threshold: number): void;
    setLastVerdict(verdict: Verdict): void;
    clearVerdicts(): void;
  };
}

/** RCF model status, threshold and the last verdict (spec §10.3). */
export const createModelSlice: StateCreator<AppState, [], [], ModelSlice> = (set) => {
  const patch = (p: Partial<ModelSlice['model']>) => set((s) => ({ model: { ...s.model, ...p } }));
  return {
    model: {
      status: 'UNTRAINED',
      progress: 0,
      reason: null,
      threshold: CONFIG.rcf.threshold,
      lastVerdict: null,
      lastScored: null,
      setStatus: (status, progress, reason) => patch({ status, progress, reason: reason ?? null }),
      setThreshold: (threshold) => patch({ threshold }),
      setLastVerdict: (lastVerdict) =>
        patch(lastVerdict.score === null ? { lastVerdict } : { lastVerdict, lastScored: lastVerdict }),
      clearVerdicts: () => patch({ lastVerdict: null, lastScored: null }),
    },
  };
};
