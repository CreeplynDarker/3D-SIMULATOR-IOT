// Bench parts from spec §13.2 as data. Metres, right-handed, y up, bench top at y = 0 (§13.1).

export type Vec3 = readonly [number, number, number];

export type ComponentId =
  | 'fan'
  | 'mpu6050'
  | 'ds18b20'
  | 'breadboard'
  | 'esp32'
  | 'r_pu_ds1'
  | 'r_pu_ds2'
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
// The team's wiring document numbers the board the other way round: its "rows" 1–63 are our columns and its
// "columns" A–E (left of the channel) are our rows a–e, so its hole A25 is `bbHole_m(25, 'a')` (D-082).
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

const MM = 0.001;

/** World x (m) of a breadboard column. */
export function bbColumnX_m(column: number): number {
  return BREADBOARD.center_m[0] + (BREADBOARD.centerColumn - column) * BREADBOARD.pitch_mm * MM;
}

/** World position (m) of a terminal-strip hole, on the board's top surface. */
export function bbHole_m(column: number, row: BbRow): Vec3 {
  return [bbColumnX_m(column), BREADBOARD.topY_m, BREADBOARD.center_m[2] + BREADBOARD.rowOffset_mm[row] * MM];
}

/** A hole named as in the wiring document, e.g. `A25` (column letter A–J, row number 1–63), or null. */
export function parseBbHole(name: string): { row: BbRow; column: number } | null {
  const m = /^([A-J])([1-9]\d?)$/.exec(name);
  const column = m ? Number(m[2]) : 0;
  if (!m || column > BREADBOARD.columns) return null;
  return { row: (m[1] as string).toLowerCase() as BbRow, column };
}

/**
 * The electrical node of a breadboard anchor: holes A–E of one row form a strip, F–J another, and each rail is one
 * node. Other anchors are their own node. `bb.A30` and `bb.D30` give the same node; `bb.F30` does not.
 */
export function bbNodeOf(anchorId: string): string {
  if (!anchorId.startsWith('bb.')) return anchorId;
  const name = anchorId.slice('bb.'.length);
  const h = parseBbHole(name);
  if (!h) return anchorId; // a rail
  return `bb.strip${'abcde'.includes(h.row) ? 'L' : 'R'}${h.column}`;
}

/** World position (m) of a hole named as in the wiring document (`A25`); throws on a bad name. */
export function bbNamedHole_m(name: string): Vec3 {
  const h = parseBbHole(name);
  if (!h) throw new Error(`no breadboard hole ${name}`);
  return bbHole_m(h.column, h.row);
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

/** Where each resistor's leads go: two breadboard holes from the wiring document (§13.3, D-082). */
export const RESISTOR_HOLES_m = {
  // DS18B20 pull-up: two 10 kΩ from rows 18 and 19 to the 3V3 rail, in parallel through the C18–C19 jumper
  r_pu_ds1: [bbNamedHole_m('A18'), bbRailHole_m('L.p', 18)],
  r_pu_ds2: [bbNamedHole_m('A19'), bbRailHole_m('L.p', 19)],
  // ACS712 OUT divider: OUT on row 30, top resistor B30–B35, bottom resistor C35 to the GND rail, GPIO34 from D35
  r_div_top: [bbNamedHole_m('B30'), bbNamedHole_m('B35')],
  r_div_bot: [bbNamedHole_m('C35'), bbRailHole_m('L.n', 35)],
} as const satisfies Record<string, readonly [Vec3, Vec3]>;
export type ResistorId = keyof typeof RESISTOR_HOLES_m;

/** Extra body height (mm): r_div_bot arches over r_div_top's lead in B35. */
const RESISTOR_LIFT_mm: Partial<Record<ResistorId, number>> = { r_div_bot: 3.5 };

/** Resistor body centre halfway between its two holes, lifted clear of the board. */
function between(id: ResistorId): Vec3 {
  const [a, b] = RESISTOR_HOLES_m[id];
  return [(a[0] + b[0]) / 2, RESISTOR_Y_m + (RESISTOR_LIFT_mm[id] ?? 0) * MM, (a[2] + b[2]) / 2];
}

const resistor = (id: ResistorId, value: string, rotY_deg: number): ComponentSpec => ({
  id,
  part: `Resistor ${value}`,
  size_mm: RESISTOR_SIZE_mm,
  position_m: between(id),
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
    notes: 'Long axis along x; left rail + = 3V3, − = GND (the right rails are unused); 5 V node on row 25.',
  },
  {
    id: 'esp32',
    part: 'ESP32 DevKit V1 (30 pins)',
    size_mm: [52, 13, 28],
    position_m: [0.05, 0.0065, 0.02],
    rotY_deg: 180,
    notes: 'Off the breadboard, pins down on the bench behind its A–E side, wired to its pins with jumpers; USB-C toward +x (the laptop).', // prettier-ignore
  },
  resistor('r_pu_ds1', '10 kΩ', 90),
  resistor('r_pu_ds2', '10 kΩ', 90),
  resistor('r_div_top', '10 kΩ', 0),
  resistor('r_div_bot', '10 kΩ', 90),
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
