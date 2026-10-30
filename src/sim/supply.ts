// 12 V adapter and the switched fan supply (spec §6.8).
import type { RelayState } from './relay.ts';
import type { SimConfig } from './types.ts';

/** Adapter output (V): nominal minus the sag fault `sag_V`, kept within [0, nominal]. */
export function supplyVoltage_V(cfg: SimConfig['supply'], sag_V: number): number {
  return Math.min(cfg.v_V, Math.max(0, cfg.v_V - sag_V));
}

/** Voltage at the fan (V): the supply while relay CH2 is on NO, otherwise 0 (fan wired on NO2). */
export function fanSupply_V(relay: RelayState, supply_V: number): number {
  return relay.contact === 'NO' ? supply_V : 0;
}
