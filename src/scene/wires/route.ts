// Wire routing (spec §11 P1.4): each wire leaves its anchor along the anchor's exit direction, rises to a travel
// height 10–30 mm above the bench (8 mm over whatever it crosses), goes around anything taller, and drops into its
// target. The points feed a centripetal Catmull–Rom curve.
import {
  BB_NODE_COLUMNS,
  bbRailHole_m,
  COMPONENTS,
  type ComponentId,
  RESISTOR_HOLES_m,
  type Vec3,
  worldBox_m,
} from '../../shared/components.ts';
import { USB_CABLE, type Wire, WIRES } from '../../shared/wiring.ts';
import { anchor, bbAnchorHoles_m, worldAnchor_m, worldAnchorExits_m, worldAnchorOut } from '../anchors.ts';

export const WIRE_RADIUS_m = 0.0008;
const LEAD_m = 0.01; // straight run out of a pin or clamp
const UP_LEAD_m = 0.008; // straight run up out of a hole or pin header
const CLEARANCE_m = 0.008;
const TRAVEL_MIN_m = 0.01;
const TRAVEL_MAX_m = 0.03;
const HIT_MARGIN_m = 0.004; // a segment closer than this to a box counts as crossing it
const DETOUR_MARGIN_m = 0.014; // how far detour corners stand off a tall box
const TALL_m = TRAVEL_MAX_m - 0.003; // parts taller than this are walked around, not over

export interface WireRoute {
  id: string;
  color: Wire['color'];
  net: Wire['net'];
  points_m: Vec3[];
  travelY_m: number;
  /** Breadboard holes this wire occupies. */
  bbHoles_m: Vec3[];
}

interface Obstacle {
  id: ComponentId | 'fanStand' | 'probeCoil';
  min: Vec3;
  max: Vec3;
}

/** Component boxes plus the bench extras drawn outside them (fan stand, probe cable coil). */
function obstacles(): Obstacle[] {
  return [
    ...COMPONENTS.map((c) => ({ id: c.id, ...worldBox_m(c) })),
    { id: 'fanStand', min: [-0.24, 0, -0.07], max: [-0.16, 0.02, -0.03] },
    { id: 'probeCoil', min: [-0.1425, 0, -0.0125], max: [-0.0975, 0.006, 0.0325] },
  ];
}

/** Parts a wire may sit on without counting as an obstacle: the MPU wires start on top of the fan frame. */
const HOSTS: Partial<Record<ComponentId, Obstacle['id'][]>> = { mpu6050: ['fan'] };

/** True if the xz segment a→b comes within `margin` of the box's xz rectangle (Liang–Barsky clip). */
function crossesXZ(a: Vec3, b: Vec3, o: Obstacle, margin: number): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const k of [0, 2] as const) {
    const d = b[k] - a[k];
    const lo = o.min[k] - margin - a[k];
    const hi = o.max[k] + margin - a[k];
    if (Math.abs(d) < 1e-12) {
      if (lo > 0 || hi < 0) return false;
      continue;
    }
    const [ta, tb] = d > 0 ? [lo / d, hi / d] : [hi / d, lo / d];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

const lenXZ = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** Detour corners (at height y) around one tall box, choosing the shortest clear path. */
function detour(a: Vec3, b: Vec3, o: Obstacle, y: number): Vec3[] {
  const m = DETOUR_MARGIN_m;
  const xs = [o.min[0] - m, o.max[0] + m];
  const zs = [o.min[2] - m, o.max[2] + m];
  const corners: Vec3[] = xs.flatMap((x) => zs.map((z): Vec3 => [x, y, z]));
  const clear = (p: Vec3, q: Vec3) => !crossesXZ(p, q, o, HIT_MARGIN_m);
  const options: Vec3[][] = [
    ...corners.map((c) => [c]),
    ...corners.flatMap((c, i) => corners.slice(i + 1).map((d) => [c, d])),
  ].filter((path) => [a, ...path, b].every((p, i, all) => i === 0 || clear(all[i - 1] as Vec3, p)));
  const cost = (path: Vec3[]) =>
    [a, ...path, b].reduce((s, p, i, all) => (i ? s + lenXZ(all[i - 1] as Vec3, p) : 0), 0);
  options.sort((p, q) => cost(p) - cost(q));
  return options[0] ?? [];
}

interface End {
  pos: Vec3;
  /** Fixed exit points after the anchor (e.g. MPU wires along the fan frame). */
  exits: Vec3[];
  out: Vec3;
  component: ComponentId;
  hole: Vec3 | null;
}

const key = (p: Vec3) => p.map((x) => x.toFixed(5)).join(',');

/** Resolves an anchor to a point; a `bb.*` anchor takes the free hole nearest `toward`. */
function resolveEnd(id: string, toward: Vec3, used: Set<string>): End {
  const component = anchor(id).component;
  const holes = bbAnchorHoles_m(id).filter((h) => !used.has(key(h)));
  if (holes.length === 0) {
    return { pos: worldAnchor_m(id), exits: worldAnchorExits_m(id), out: worldAnchorOut(id), component, hole: null };
  }
  holes.sort((p, q) => lenXZ(p, toward) - lenXZ(q, toward));
  const hole = holes[0] as Vec3;
  used.add(key(hole));
  return { pos: hole, exits: [], out: [0, 1, 0], component, hole };
}

const isUp = (e: End) => e.out[1] > 0.99;

/** Lead point just outside an end (after its exit points), along its exit direction. */
function lead(e: End): Vec3 {
  const p = e.exits.at(-1) ?? e.pos;
  const d = isUp(e) ? UP_LEAD_m : LEAD_m;
  return [p[0] + e.out[0] * d, p[1] + e.out[1] * d, p[2] + e.out[2] * d];
}

/** Anchor, exit points and a midpoint on a sideways lead (keeps the curve from dipping before the pin). */
function endPath(e: End): Vec3[] {
  const p = e.exits.at(-1) ?? e.pos;
  const a = lead(e);
  const mid: Vec3[] = isUp(e) ? [] : [[(p[0] + a[0]) / 2, (p[1] + a[1]) / 2, (p[2] + a[2]) / 2]];
  return [e.pos, ...e.exits, ...mid, a];
}

/** Travel height: 8 mm over the tallest part it can pass over (capped at 30 mm), at least an upward lead. */
function travelHeight(a: Vec3, b: Vec3, skip: Set<Obstacle['id']>, ends: End[], all: Obstacle[]): number {
  let y = TRAVEL_MIN_m;
  for (const o of all) {
    if (skip.has(o.id) || !crossesXZ(a, b, o, HIT_MARGIN_m)) continue;
    if (o.max[1] <= TALL_m) y = Math.max(y, o.max[1] + CLEARANCE_m);
  }
  for (const e of ends) if (isUp(e)) y = Math.max(y, lead(e)[1]);
  return Math.min(y, TRAVEL_MAX_m);
}

const SHOULDER_m = 0.012;
const MIN_SHOULDER_m = 0.004;

/** Adds a point 12 mm (or a quarter of the leg) in from each end of every horizontal leg, so corners stay tight. */
function withShoulders(leg: Vec3[]): Vec3[] {
  const out: Vec3[] = leg.slice(0, 1);
  for (let i = 1; i < leg.length; i++) {
    const p = leg[i - 1] as Vec3;
    const q = leg[i] as Vec3;
    const len = lenXZ(p, q);
    if (len > 2 * MIN_SHOULDER_m) {
      const t = Math.min(SHOULDER_m, len / 4) / len;
      const at = (u: number): Vec3 => [p[0] + (q[0] - p[0]) * u, p[1], p[2] + (q[2] - p[2]) * u];
      out.push(at(t), at(1 - t));
    }
    out.push(q);
  }
  return out;
}

/** Control points of one wire, from anchor to anchor. */
function routeOne(w: Wire, used: Set<string>, all: Obstacle[]): WireRoute {
  const fromIsBb = w.from.startsWith('bb.');
  const toIsBb = w.to.startsWith('bb.');
  const ref = (id: string) => worldAnchor_m(id);
  // resolve the fixed end first so a breadboard end picks the hole nearest to it
  const to0 = toIsBb && !fromIsBb ? null : resolveEnd(w.to, ref(w.from), used);
  const from = resolveEnd(w.from, to0?.pos ?? ref(w.to), used);
  const to = to0 ?? resolveEnd(w.to, from.pos, used);
  const skip = new Set<Obstacle['id']>([from.component, to.component]);
  for (const c of [from.component, to.component]) for (const h of HOSTS[c] ?? []) skip.add(h);

  const a = lead(from);
  const b = lead(to);
  const y = travelHeight(a, b, skip, [from, to], all);
  const ra: Vec3 = [a[0], y, a[2]];
  const rb: Vec3 = [b[0], y, b[2]];
  const tall = all.filter((o) => !skip.has(o.id) && o.max[1] > TALL_m);
  const blocker = tall.find((o) => crossesXZ(ra, rb, o, HIT_MARGIN_m));
  const via = blocker ? detour(ra, rb, blocker, y) : [];
  const leg = withShoulders([ra, ...via, rb]);
  const near = (p: Vec3, q: Vec3) => Math.abs(p[1] - q[1]) < 0.004;
  const travel = leg.slice(near(a, ra) ? 1 : 0, near(b, rb) ? -1 : undefined);
  const points: Vec3[] = [...endPath(from), ...travel, ...endPath(to).reverse()];
  return {
    id: w.id,
    color: w.color,
    net: w.net,
    points_m: points,
    travelY_m: y,
    bbHoles_m: [from.hole, to.hole].filter((h): h is Vec3 => h !== null),
  };
}

/** Rail holes under the pull-up bodies, which arch from row a over the L− rail to the L+ rail. */
const COVERED_HOLES_m: Vec3[] = [bbRailHole_m('L.n', BB_NODE_COLUMNS.dq), bbRailHole_m('L.n', BB_NODE_COLUMNS.tach)];

/** Routes W01–W29 in order; breadboard holes are never shared (resistor holes are taken first). */
export function routeWires(): WireRoute[] {
  const taken = [...Object.values(RESISTOR_HOLES_m).flat(), ...COVERED_HOLES_m];
  const used = new Set<string>(taken.map(key));
  const all = obstacles();
  return WIRES.map((w) => routeOne(w, used, all));
}

/** The grey USB cable: out of the ESP32's USB-C (−x), round the front of the breadboard, into the laptop. */
export function usbRoute(): Vec3[] {
  const start = worldAnchor_m(USB_CABLE.from);
  const end = worldAnchor_m(USB_CABLE.to);
  const out = worldAnchorOut(USB_CABLE.to);
  return [
    start,
    [start[0] - 0.01, start[1], start[2]],
    [-0.044, 0.012, 0.08],
    [-0.048, 0.004, 0.114],
    [0.06, 0.004, 0.126],
    [0.17, 0.004, 0.115],
    [end[0] + out[0] * 0.03, 0.005, end[2] + out[2] * 0.03 + 0.02],
    [end[0] + out[0] * 0.012, end[1], end[2] + out[2] * 0.012],
    end,
  ];
}
