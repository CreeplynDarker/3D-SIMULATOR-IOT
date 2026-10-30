import { describe, expect, it } from 'vitest';
import {
  BREADBOARD,
  bbColumnX_m,
  bbRailColumns,
  COMPONENTS,
  componentById,
  type ComponentSpec,
  worldBox_m,
} from '../../../src/shared/components.ts';

const overlaps = (a: ComponentSpec, b: ComponentSpec) => {
  const p = worldBox_m(a);
  const q = worldBox_m(b);
  return [0, 1, 2].every((k) => (p.min[k] ?? 0) < (q.max[k] ?? 0) && (q.min[k] ?? 0) < (p.max[k] ?? 0));
};

describe('component catalogue (§13.2)', () => {
  it('lists every §13.2 part once', () => {
    expect(COMPONENTS.map((c) => c.id)).toEqual([
      'fan',
      'mpu6050',
      'ds18b20',
      'breadboard',
      'esp32',
      'r_pu_ds',
      'r_pu_tach',
      'r_div_top',
      'r_div_bot',
      'acs712',
      'relay',
      'dcjack',
      'adapter',
      'laptop',
    ]);
  });

  it('keeps the §13.2 sizes', () => {
    expect(componentById('fan').size_mm).toEqual([70, 70, 15]);
    expect(componentById('breadboard').size_mm).toEqual([165, 9.5, 55]);
    expect(componentById('esp32').size_mm).toEqual([52, 13, 28]);
    expect(componentById('relay').size_mm).toEqual([50, 19, 38]);
    expect(componentById('r_div_top').size_mm).toEqual([6, 2.3, 2.3]);
  });

  it('keeps every part within ±0.02 m of its §13.2 position', () => {
    const nominal: Record<string, [number, number, number]> = {
      fan: [-0.2, 0.055, -0.05],
      mpu6050: [-0.2, 0.091, -0.05],
      ds18b20: [-0.2, 0.055, -0.06],
      breadboard: [0.05, 0.005, 0.08],
      esp32: [0.02, 0.017, 0.08],
      acs712: [0, 0.006, -0.1],
      relay: [0.14, 0.0095, -0.08],
      dcjack: [-0.12, 0.006, -0.15],
      adapter: [-0.3, 0.0225, -0.17],
    };
    for (const [id, p] of Object.entries(nominal)) {
      const c = componentById(id as ComponentSpec['id']);
      for (let k = 0; k < 3; k++) expect(Math.abs((c.position_m[k] ?? 0) - (p[k] ?? 0))).toBeLessThanOrEqual(0.02);
    }
  });

  it('rotates only the laptop (−20° about y)', () => {
    expect(COMPONENTS.filter((c) => c.rotY_deg !== 0 && !c.id.startsWith('r_')).map((c) => c.id)).toEqual(['laptop']);
    expect(componentById('laptop').rotY_deg).toBe(-20);
  });

  it('rests every part on or above the bench', () => {
    for (const c of COMPONENTS) expect(worldBox_m(c).min[1]).toBeGreaterThanOrEqual(-1e-9);
  });

  it('has no two bounding boxes intersecting', () => {
    const hits: string[] = [];
    COMPONENTS.forEach((a, i) =>
      COMPONENTS.slice(i + 1).forEach((b) => {
        if (overlaps(a, b)) hits.push(`${a.id} × ${b.id}`);
      }),
    );
    expect(hits).toEqual([]);
  });
});

describe('breadboard grid', () => {
  it('has 63 columns at 2.54 mm pitch centred on the board', () => {
    expect(bbColumnX_m(BREADBOARD.centerColumn)).toBeCloseTo(BREADBOARD.center_m[0], 9);
    expect(bbColumnX_m(1) - bbColumnX_m(2)).toBeCloseTo(0.00254, 9);
  });

  it('has 10 groups of 5 rail holes (50 per rail, 830 points in all)', () => {
    expect(bbRailColumns()).toHaveLength(50);
    expect(63 * 10 + 4 * bbRailColumns().length).toBe(830);
  });
});
