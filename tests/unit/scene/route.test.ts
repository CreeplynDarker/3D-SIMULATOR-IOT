import { CatmullRomCurve3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { COMPONENTS, type ComponentId, type Vec3, worldBox_m } from '../../../src/shared/components.ts';
import { WIRES } from '../../../src/shared/wiring.ts';
import { anchor, worldAnchor_m } from '../../../src/scene/anchors.ts';
import { routeWires, usbRoute, WIRE_RADIUS_m } from '../../../src/scene/wires/route.ts';

const routes = routeWires();
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Components a wire may touch: the ones it connects (a bb.* end is the breadboard). */
function endpoints(from: string, to: string): Set<ComponentId> {
  return new Set([anchor(from).component, anchor(to).component]);
}

/** Points on the rendered centreline that sit inside a component box, grown by the tube radius. */
function collisions(points: readonly Vec3[], skip: Set<ComponentId>): string[] {
  const curve = new CatmullRomCurve3(
    points.map((p) => new Vector3(...p)),
    false,
    'centripetal',
  );
  const hits = new Set<string>();
  for (const v of curve.getSpacedPoints(400)) {
    for (const c of COMPONENTS) {
      if (skip.has(c.id)) continue;
      const { min, max } = worldBox_m(c);
      const r = WIRE_RADIUS_m;
      const inside = [v.x, v.y, v.z].every((x, k) => x > (min[k] ?? 0) - r && x < (max[k] ?? 0) + r);
      if (inside) hits.add(c.id);
    }
  }
  return [...hits];
}

describe('wire routes (P1.4)', () => {
  it('routes all 29 wires', () => {
    expect(routes.map((r) => r.id)).toEqual(WIRES.map((w) => w.id));
  });

  it('starts and ends each wire at its anchors (breadboard ends in a free hole of that rail or node)', () => {
    for (const r of routes) {
      const w = WIRES.find((x) => x.id === r.id);
      if (!w) throw new Error(r.id);
      const first = r.points_m[0] as Vec3;
      const last = r.points_m.at(-1) as Vec3;
      if (!w.from.startsWith('bb.')) expect(dist(first, worldAnchor_m(w.from))).toBeLessThan(1e-9);
      if (!w.to.startsWith('bb.')) expect(dist(last, worldAnchor_m(w.to))).toBeLessThan(1e-9);
    }
  });

  it('never puts two wires in the same breadboard hole', () => {
    const holes = routes.flatMap((r) => r.bbHoles_m.map((h) => h.map((x) => x.toFixed(5)).join(',')));
    expect(new Set(holes).size).toBe(holes.length);
  });

  it('lifts each wire 10–30 mm above the bench between its ends', () => {
    for (const r of routes) {
      expect(r.travelY_m).toBeGreaterThanOrEqual(0.01);
      expect(r.travelY_m).toBeLessThanOrEqual(0.03);
    }
  });

  it('the rendered curve stays within 2 mm of its travel height (no Catmull–Rom overshoot)', () => {
    const over = routes.filter((r) => {
      const curve = new CatmullRomCurve3(
        r.points_m.map((p) => new Vector3(...p)),
        false,
        'centripetal',
      );
      const ends = Math.max(r.points_m[1]?.[1] ?? 0, r.points_m.at(-2)?.[1] ?? 0); // a lead may start higher (MPU)
      const maxY = Math.max(...curve.getSpacedPoints(400).map((v) => v.y));
      return maxY > Math.max(r.travelY_m, ends) + 0.002;
    });
    expect(over.map((r) => r.id)).toEqual([]);
  });

  it('no wire passes through a component', () => {
    const bad = routes
      .map((r): [string, string[]] => {
        const w = WIRES.find((x) => x.id === r.id);
        return w ? [r.id, collisions(r.points_m, endpoints(w.from, w.to))] : [r.id, ['?']];
      })
      .filter(([, hits]) => hits.length > 0);
    expect(bad).toEqual([]);
  });

  it('the USB cable clears every component but the ESP32 and the laptop', () => {
    expect(collisions(usbRoute(), new Set<ComponentId>(['esp32', 'laptop']))).toEqual([]);
  });
});
