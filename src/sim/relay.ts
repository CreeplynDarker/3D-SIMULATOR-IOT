// Relay CH2 (spec §6.8): low-level trigger, contact moves to NO after `pullIn_s` of continuous coil current and back to
// NC after `release_s` without it.
import { GPIO_LOW, type GpioLevel, type SimConfig } from './types.ts';

export interface RelayState {
  coilOn: boolean;
  contact: 'NC' | 'NO';
  /** Time the coil has been in a state that disagrees with the contact (s). */
  pending_s: number;
}

/** Relay at boot: coil off, contact on NC (fan unpowered, fail-safe). */
export function createRelay(): RelayState {
  return { coilOn: false, contact: 'NC', pending_s: 0 };
}

/** Advances the relay by `dt_s` with IN2 driven to `gpio26`; mutates `relay`. */
export function stepRelay(relay: RelayState, cfg: SimConfig['relay'], gpio26: GpioLevel, dt_s: number): void {
  relay.coilOn = gpio26 === GPIO_LOW;
  const wants = relay.coilOn ? 'NO' : 'NC';
  if (wants === relay.contact) {
    relay.pending_s = 0;
    return;
  }
  relay.pending_s += dt_s;
  const delay_s = relay.coilOn ? cfg.pullIn_s : cfg.release_s;
  if (relay.pending_s >= delay_s - dt_s / 2) {
    relay.contact = wants;
    relay.pending_s = 0;
  }
}
