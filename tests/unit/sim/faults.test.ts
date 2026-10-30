import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import type { SimEvent } from '../../../src/shared/messages.ts';
import { clearFaults, createFaults, setFault, stepFaults } from '../../../src/sim/faults.ts';

const dt_s = CONFIG.physics.dt_s;

describe('faults (§6.9)', () => {
  it('starts with every fault off', () => {
    expect(createFaults().values).toEqual({
      imbalance_g: 0,
      looseness: 0,
      friction: 0,
      overheat: 0,
      supplySag_V: 0,
      packetLoss: 0,
      ds18b20Disconnect: false,
    });
  });

  it('applies a step on the next step', () => {
    const f = createFaults();
    const events: SimEvent[] = [];
    setFault(f, 'imbalance_g', 0.3, 0, 60, (e) => events.push(e));
    stepFaults(f, 60 + dt_s);
    expect(f.values.imbalance_g).toBe(0.3);
    expect(events).toEqual([{ t_s: 60, type: 'FAULT_SET', detail: 'imbalance_g=0.3' }]);
  });

  it('a 30 s ramp hits 50% at 15 s ±1 step and stops at the target', () => {
    const f = createFaults();
    setFault(f, 'friction', 0.5, 30, 60, () => undefined);
    let t_s = 60;
    let at15: number | null = null;
    for (let k = 1; k <= Math.round(40 / dt_s); k++) {
      t_s = 60 + k * dt_s;
      stepFaults(f, t_s);
      if (at15 === null && Math.abs(t_s - 75) < dt_s / 2) at15 = f.values.friction;
    }
    const oneStep = (0.5 / 30) * dt_s;
    expect(Math.abs((at15 ?? -1) - 0.25)).toBeLessThanOrEqual(oneStep + 1e-12);
    expect(f.values.friction).toBe(0.5);
  });

  it('ramps from the current value when a new ramp interrupts one', () => {
    const f = createFaults();
    setFault(f, 'overheat', 1, 10, 0, () => undefined);
    stepFaults(f, 5);
    expect(f.values.overheat).toBeCloseTo(0.5, 12);
    setFault(f, 'overheat', 0, 5, 5, () => undefined);
    stepFaults(f, 7.5);
    expect(f.values.overheat).toBeCloseTo(0.25, 12);
  });

  it('sets the DS18B20 disconnect switch at once, ignoring the ramp', () => {
    const f = createFaults();
    const events: SimEvent[] = [];
    setFault(f, 'ds18b20Disconnect', true, 5, 60, (e) => events.push(e));
    expect(f.values.ds18b20Disconnect).toBe(true);
    expect(events[0]?.detail).toBe('ds18b20Disconnect=true');
  });

  it('clearAll zeroes every key, cancels ramps and emits FAULT_SET', () => {
    const f = createFaults();
    const events: SimEvent[] = [];
    const emit = (e: SimEvent) => events.push(e);
    setFault(f, 'looseness', 0.6, 0, 1, emit);
    setFault(f, 'supplySag_V', 2, 10, 1, emit);
    setFault(f, 'ds18b20Disconnect', true, 0, 1, emit);
    stepFaults(f, 3);
    clearFaults(f, 4, emit);
    stepFaults(f, 8);
    expect(f.values).toEqual(createFaults().values);
    expect(events.map((e) => e.type)).toEqual(['FAULT_SET', 'FAULT_SET', 'FAULT_SET', 'FAULT_SET']);
    expect(events.at(-1)).toEqual({ t_s: 4, type: 'FAULT_SET', detail: 'clearAll' });
  });

  it('describes a ramped change in its event', () => {
    const events: SimEvent[] = [];
    setFault(createFaults(), 'friction', 0.5, 30, 60, (e) => events.push(e));
    expect(events[0]?.detail).toBe('friction=0.5 ramp 30 s');
  });
});
