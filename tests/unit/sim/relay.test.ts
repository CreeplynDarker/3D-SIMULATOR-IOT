import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import { createRelay, type RelayState, stepRelay } from '../../../src/sim/relay.ts';
import { fanSupply_V, supplyVoltage_V } from '../../../src/sim/supply.ts';
import { GPIO_HIGH, GPIO_LOW, type GpioLevel } from '../../../src/sim/types.ts';

const dt_s = CONFIG.physics.dt_s;

/** Steps the relay with `level` until the contact reads `want`; returns the elapsed time (s). */
function timeTo(relay: RelayState, level: GpioLevel, want: 'NC' | 'NO'): number {
  let n = 0;
  while (relay.contact !== want && n < 1000) {
    stepRelay(relay, CONFIG.relay, level, dt_s);
    n++;
  }
  return n * dt_s;
}

describe('relay CH2 (§6.8)', () => {
  it('boots de-energised with the contact on NC', () => {
    const relay = createRelay();
    expect(relay).toMatchObject({ coilOn: false, contact: 'NC' });
  });

  it('closes NO 10 ms after GPIO26 goes LOW and opens 5 ms after it goes HIGH', () => {
    const relay = createRelay();
    expect(timeTo(relay, GPIO_LOW, 'NO')).toBeCloseTo(CONFIG.relay.pullIn_s, 9);
    expect(relay.coilOn).toBe(true);
    expect(timeTo(relay, GPIO_HIGH, 'NC')).toBeCloseTo(CONFIG.relay.release_s, 9);
    expect(relay.coilOn).toBe(false);
  });

  it('needs continuous coil-on: a LOW glitch shorter than the pull-in time does not close it', () => {
    const relay = createRelay();
    for (let k = 0; k < 10; k++) stepRelay(relay, CONFIG.relay, GPIO_LOW, dt_s); // 5 ms
    stepRelay(relay, CONFIG.relay, GPIO_HIGH, dt_s);
    for (let k = 0; k < 15; k++) stepRelay(relay, CONFIG.relay, GPIO_LOW, dt_s); // 7.5 ms
    expect(relay.contact).toBe('NC');
  });
});

describe('supply (§6.8)', () => {
  it('feeds the fan 0 V while the contact is NC and 12 V on NO', () => {
    const relay = createRelay();
    expect(fanSupply_V(relay, supplyVoltage_V(CONFIG.supply, 0))).toBe(0);
    timeTo(relay, GPIO_LOW, 'NO');
    expect(fanSupply_V(relay, supplyVoltage_V(CONFIG.supply, 0))).toBe(12);
  });

  it('a 2 V sag lowers the fan voltage to 10 V, never below 0 or above the adapter', () => {
    const relay = createRelay();
    timeTo(relay, GPIO_LOW, 'NO');
    expect(fanSupply_V(relay, supplyVoltage_V(CONFIG.supply, 2))).toBe(10);
    expect(supplyVoltage_V(CONFIG.supply, -1)).toBe(12);
    expect(supplyVoltage_V(CONFIG.supply, 20)).toBe(0);
  });
});
