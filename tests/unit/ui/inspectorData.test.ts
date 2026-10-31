import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/shared/config.ts';
import { COMPONENTS } from '../../../src/shared/components.ts';
import { createPlant, toSnapshot } from '../../../src/sim/plant.ts';
import { inspectorFor } from '../../../src/ui/inspectorData.ts';

const snap = () => {
  const s = toSnapshot(createPlant(CONFIG, CONFIG.seed, { warmStart: true }));
  return { ...s, acsOut_V: 2.5331, adcPin_V: 1.6887, adcCounts: 1965, gpio26: 0 as const, contact: 'NO' as const, coilOn: true }; // prettier-ignore
};

describe('M9 inspector data (§8.2)', () => {
  it('every component has a name, specs and its wires from §13.3', () => {
    for (const c of COMPONENTS) {
      const info = inspectorFor(c.id, snap(), { status: 'READY', score: 0.2 });
      expect(info.name, c.id).toBe(c.part);
      expect(info.specs.length, c.id).toBeGreaterThan(0);
      // Resistors list the wires on their two breadboard holes' nodes; the breadboard lists every `bb.*` wire.
      const prefix = c.id === 'breadboard' ? 'bb.' : c.id.startsWith('r_') ? 'bb.' : `${c.id}.`;
      if (c.id !== 'laptop') expect(info.wires.length, c.id).toBeGreaterThan(0);
      for (const w of info.wires)
        expect(w.from.startsWith(prefix) || w.to.startsWith(prefix), `${c.id} ${w.id}`).toBe(true);
    }
    expect(inspectorFor('acs712', snap(), null).wires.map((w) => w.id)).toEqual(['W02', 'W03', 'W11', 'W12', 'W25']);
  });

  it('pins carry live values, e.g. "ACS712 OUT 2.533 V → GPIO34 1965 counts"', () => {
    const pins = inspectorFor('acs712', snap(), null).pins.map((p) => p.text);
    expect(pins).toContain('ACS712 OUT 2.533 V → GPIO34 1965 counts');
    const relay = inspectorFor('relay', snap(), null).pins.map((p) => p.text);
    expect(relay).toContain('IN2 ← GPIO26 LOW (coil on)');
    expect(relay).toContain('COM2 → NO2 closed');
    expect(inspectorFor('fan', snap(), null).photo).toBe('textures/fan-hub.jpg');
    expect(inspectorFor('laptop', snap(), { status: 'READY', score: 0.21 }).pins.map((p) => p.text)).toContain('RCF READY, score 0.21'); // prettier-ignore
  });
});
