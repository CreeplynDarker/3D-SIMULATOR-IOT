// Enable rules and status text for the M5 operator panel (spec §8.2). They read state; they compute nothing physical.
import type { FaultValues, ModelStatus } from '../shared/messages.ts';
import type { State } from '../shared/protocol.ts';

/** `btn-start` is enabled only in OFF. */
export const canStart = (state: State): boolean => state === 'OFF';

/** `btn-reset` is enabled only in CRITICAL. */
export const canReset = (state: State): boolean => state === 'CRITICAL';

/** True if any fault is injected (numeric above 0, or the probe disconnected). */
export function anyFault(f: FaultValues): boolean {
  return Object.values(f).some((v) => v !== 0 && v !== false);
}

/** `btn-train`: NORMAL, no active fault, and the last window's |dT/dt| (°C/min) at most `warmDtdtMax_C_per_min`. */
export function canTrain(
  state: State,
  faults: FaultValues,
  dtdt_C_per_min: number | null,
  warmDtdtMax_C_per_min: number,
): boolean {
  // prettier-ignore
  if (state !== 'NORMAL' || anyFault(faults) || dtdt_C_per_min === null) return false;
  return Math.abs(dtdt_C_per_min) <= warmDtdtMax_C_per_min;
}

/** `model-status`: UNTRAINED / TRAINING n/N / READY, with `progress` 0…1 of `windows` training windows. */
export function modelStatusText(status: ModelStatus, progress: number, windows: number): string {
  return status === 'TRAINING' ? `TRAINING ${Math.round(progress * windows)}/${windows}` : status;
}
