// Bench parts from spec §13.2 as data. Metres, right-handed, y up, bench top at y = 0 (§13.1).

export type Vec3 = readonly [number, number, number];

export type ComponentId =
  | 'fan'
  | 'mpu6050'
  | 'ds18b20'
  | 'breadboard'
  | 'esp32'
  | 'r_pu_ds'
  | 'r_pu_tach'
  | 'r_div_top'
  | 'r_div_bot'
  | 'acs712'
  | 'relay'
  | 'dcjack'
  | 'adapter'
  | 'laptop';

export interface ComponentSpec {
  id: ComponentId;
  part: string;
  /** Bounding-box size (x × y × z) in mm, before rotation. */
  size_mm: Vec3;
  /** Bounding-box centre in metres. */
  position_m: Vec3;
  /** Rotation about +y in degrees (counter-clockwise seen from above). */
  rotY_deg: number;
  notes: string;
}

// 830-point breadboard (§13.2/§13.3). Column 1 is at the +x end; rows a–e on −z, f–j on +z; rails run along x.
// Left rail (−z): + outside, − inside; right rail (+z): + inside, − outside — as on the team's board.
export const BREADBOARD = {
  center_m: [0.05, 0.005, 0.08] as Vec3,
  topY_m: 0.00975,
  pitch_mm: 2.54,
  columns: 63,
  centerColumn: 32,
  rowOffset_mm: { a: -13.97, b: -11.43, c: -8.89, d: -6.35, e: -3.81, f: 3.81, g: 6.35, h: 8.89, i: 11.43, j: 13.97 },
  railOffset_mm: { 'L.p': -21.59, 'L.n': -19.05, 'R.p': 19.05, 'R.n': 21.59 },
  railFirstColumn: 3,
  railGroups: 10,
  railGroupSize: 5,
} as const;

export type BbRow = keyof typeof BREADBOARD.rowOffset_mm;
export type BbRail = keyof typeof BREADBOARD.railOffset_mm;

/** Columns of the breadboard nodes chosen for §13.3 (`bb.node.*`), clear of the ESP32. */
export const BB_NODE_COLUMNS = { dq: 30, tach: 25, divTop: 20, divMid: 17 } as const;
export type BbNode = keyof typeof BB_NODE_COLUMNS;

/** Column under ESP32 pins EN and D23 (the antenna end); pin k of each header sits in column first + k. */
export const ESP32_FIRST_COLUMN = 37;
/** ESP32 header rows: the left column (§1.4) sits in row b, the right column in row i. */
export const ESP32_ROWS = { left: 'b', right: 'i' } as const;

const MM = 0.001;

/** World x (m) of a breadboard column. */
export function bbColumnX_m(column: number): number {
  return BREADBOARD.center_m[0] + (BREADBOARD.centerColumn - column) * BREADBOARD.pitch_mm * MM;
}

/** World position (m) of a terminal-strip hole, on the board's top surface. */
export function bbHole_m(column: number, row: BbRow): Vec3 {
  return [bbColumnX_m(column), BREADBOARD.topY_m, BREADBOARD.center_m[2] + BREADBOARD.rowOffset_mm[row] * MM];
}

/** World position (m) of a rail hole, on the board's top surface. */
export function bbRailHole_m(rail: BbRail, column: number): Vec3 {
  return [bbColumnX_m(column), BREADBOARD.topY_m, BREADBOARD.center_m[2] + BREADBOARD.railOffset_mm[rail] * MM];
}

/** Columns that have rail holes: groups of 5 with a one-hole gap, 50 per rail. */
export function bbRailColumns(): number[] {
  const { railFirstColumn, railGroups, railGroupSize } = BREADBOARD;
  return Array.from({ length: railGroups * railGroupSize }, (_, i) => {
    const group = Math.floor(i / railGroupSize);
    return railFirstColumn + group * (railGroupSize + 1) + (i % railGroupSize);
  });
}

const RESISTOR_SIZE_mm: Vec3 = [6, 2.3, 2.3];
const RESISTOR_Y_m = BREADBOARD.topY_m + 0.6 * MM + (RESISTOR_SIZE_mm[1] / 2) * MM; // body clears the board

/** Resistor body centre halfway between two holes. */
function between(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, RESISTOR_Y_m, (a[2] + b[2]) / 2];
}

const { dq, tach, divTop, divMid } = BB_NODE_COLUMNS;

/** Where each resistor's leads go: two holes on the breadboard (§13.3). */
export const RESISTOR_HOLES_m = {
  r_pu_ds: [bbHole_m(dq, 'a'), bbRailHole_m('L.p', dq)],
  r_pu_tach: [bbHole_m(tach, 'a'), bbRailHole_m('L.p', tach)],
  r_div_top: [bbHole_m(divTop, 'e'), bbHole_m(divMid, 'e')],
  r_div_bot: [bbHole_m(divMid, 'b'), bbRailHole_m('L.n', divMid)],
} as const satisfies Record<string, readonly [Vec3, Vec3]>;

const resistor = (id: keyof typeof RESISTOR_HOLES_m, value: string, rotY_deg: number): ComponentSpec => ({
  id,
  part: `Resistor ${value}`,
  size_mm: RESISTOR_SIZE_mm,
  position_m: between(...RESISTOR_HOLES_m[id]),
  rotY_deg,
  notes: 'On the breadboard; leads run from the body ends into its two holes.',
});

export const COMPONENTS: readonly ComponentSpec[] = [
  {
    id: 'fan',
    part: 'Delta AFB0712HB-F00 fan',
    size_mm: [70, 70, 15],
    position_m: [-0.2, 0.055, -0.05],
    rotY_deg: 0,
    notes: 'Face in the x–y plane, airflow +z, 7 blades; on a 20 mm stand.',
  },
  {
    id: 'mpu6050',
    part: 'MPU6050 GY-521',
    size_mm: [21, 1.6, 16],
    position_m: [-0.2, 0.091, -0.05],
    rotY_deg: 0,
    notes: "Flat on the frame's top edge (OPEN-4).",
  },
  {
    id: 'ds18b20',
    part: 'DS18B20 probe',
    size_mm: [50, 6, 6],
    position_m: [-0.2, 0.055, -0.061],
    rotY_deg: 0,
    notes: 'Ø6 × 50 steel tip taped across the hub on the intake side; 1 m cable coiled on the bench.',
  },
  {
    id: 'breadboard',
    part: '830-point breadboard',
    size_mm: [165, 9.5, 55],
    position_m: BREADBOARD.center_m,
    rotY_deg: 0,
    notes: 'Long axis along x; left rail + = 3V3, right rail + = 5 V, both − = GND.',
  },
  {
    id: 'esp32',
    part: 'ESP32 DevKit V1 (30 pins)',
    size_mm: [52, 13, 28],
    position_m: [bbColumnX_m(ESP32_FIRST_COLUMN + 7), 0.017, BREADBOARD.center_m[2]],
    rotY_deg: 0,
    notes: 'Straddles the centre channel, pins in rows b and i; USB-C toward −x.',
  },
  resistor('r_pu_ds', '4.7 kΩ', 90),
  resistor('r_pu_tach', '10 kΩ', 90),
  resistor('r_div_top', '10 kΩ', 0),
  resistor('r_div_bot', '20 kΩ', 90),
  {
    id: 'acs712',
    part: 'ACS712 current module (5 A)',
    size_mm: [31, 12, 13],
    position_m: [0, 0.006, -0.1],
    rotY_deg: 0,
    notes: 'Terminals toward −x.',
  },
  {
    id: 'relay',
    part: '2-channel relay module',
    size_mm: [50, 19, 38],
    position_m: [0.14, 0.0095, -0.08],
    rotY_deg: 0,
    notes: 'Terminals toward −z; CH1 (−x) marked unused.',
  },
  {
    id: 'dcjack',
    part: 'Female barrel jack with screw terminals',
    size_mm: [25, 12, 15],
    position_m: [-0.12, 0.006, -0.15],
    rotY_deg: 0,
    notes: 'OPEN-6. Socket toward −x, terminals toward +x.',
  },
  {
    id: 'adapter',
    part: 'JSY-1220 12 V 1 A adapter',
    size_mm: [75, 30, 45],
    position_m: [-0.3, 0.015, -0.17],
    rotY_deg: 0,
    notes: 'Lying flat (§13.2 gives y = 0.0225; lowered to rest on the bench). Barrel cable to dcjack.',
  },
  {
    id: 'laptop',
    part: 'Laptop',
    size_mm: [320, 220, 220],
    position_m: [0.4, 0.11, 0.02],
    rotY_deg: -20,
    notes: '320 × 220 footprint open (§13.2); height 220 mm chosen; screen shows a mini dashboard.',
  },
];

/** Looks up a component by id; throws on an unknown id. */
export function componentById(id: ComponentId): ComponentSpec {
  const c = COMPONENTS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown component ${id}`);
  return c;
}

/** Rotates a local offset (any length unit) about +y by `rotY_deg`. */
export function rotateY(v: Vec3, rotY_deg: number): Vec3 {
  const a = (rotY_deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

/** Axis-aligned world bounding box (m) of a component, rotation included. */
export function worldBox_m(c: ComponentSpec): { min: Vec3; max: Vec3 } {
  const a = (c.rotY_deg * Math.PI) / 180;
  const hx = (c.size_mm[0] * MM) / 2;
  const hy = (c.size_mm[1] * MM) / 2;
  const hz = (c.size_mm[2] * MM) / 2;
  const ex = Math.abs(Math.cos(a)) * hx + Math.abs(Math.sin(a)) * hz;
  const ez = Math.abs(Math.sin(a)) * hx + Math.abs(Math.cos(a)) * hz;
  const [x, y, z] = c.position_m;
  return { min: [x - ex, y - hy, z - ez], max: [x + ex, y + hy, z + ez] };
}
