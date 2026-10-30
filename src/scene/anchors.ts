// Pin anchors (spec §1.5, §13.3): local positions in mm per component, world positions from the layout.
import {
  BB_NODE_COLUMNS,
  type BbNode,
  type BbRail,
  type BbRow,
  bbHole_m,
  bbRailColumns,
  bbRailHole_m,
  BREADBOARD,
  type ComponentId,
  componentById,
  rotateY,
  type Vec3,
} from '../shared/components.ts';

export interface Anchor {
  component: ComponentId;
  /** Position in the component's local frame (mm, origin at its bounding-box centre). */
  pos_mm: Vec3;
  /** Unit direction a wire leaves the anchor, in the local frame (after any exit points). */
  out: Vec3;
  /** Fixed points (local mm) a wire passes through right after leaving the anchor. */
  exit_mm?: Vec3[];
}

type AnchorTable = Record<string, Omit<Anchor, 'component'>>;

const unit = (x: number, y: number, z: number): Vec3 => {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
};
const UP = unit(0, 1, 0);
const PX = unit(1, 0, 0);
const NX = unit(-1, 0, 0);
const PZ = unit(0, 0, 1);
const NZ = unit(0, 0, -1);

// ESP32 DevKit V1 headers (§1.4), listed from the antenna end (+x) to the USB end (−x).
export const ESP32_LEFT_PINS = ['EN', 'VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'GND', 'VIN'] as const; // prettier-ignore
export const ESP32_RIGHT_PINS = ['D23', 'D22', 'TX0', 'RX0', 'D21', 'D19', 'D18', 'D5', 'TX2', 'RX2', 'D4', 'D2', 'D15', 'GND2', '3V3'] as const; // prettier-ignore
/** ESP32 local geometry (mm): pin pitch, header half-spacing (rows b/i), top of the solder joints. */
export const ESP32_DIMS = { pitch: 2.54, rowHalf: 11.43, solderTopY: 4.6 } as const;

/** Local x (mm) of ESP32 header pin k (0 = antenna end). */
export function esp32PinX_mm(k: number): number {
  return (7 - k) * ESP32_DIMS.pitch;
}

function esp32Anchors(): AnchorTable {
  const t: AnchorTable = {};
  const { rowHalf, solderTopY } = ESP32_DIMS;
  ESP32_LEFT_PINS.forEach((name, k) => (t[name] = { pos_mm: [esp32PinX_mm(k), solderTopY, -rowHalf], out: UP }));
  ESP32_RIGHT_PINS.forEach((name, k) => (t[name] = { pos_mm: [esp32PinX_mm(k), solderTopY, rowHalf], out: UP }));
  t['usb'] = { pos_mm: [-26, 5.3, 0], out: NX };
  t['antenna'] = { pos_mm: [23, 4.2, 0], out: UP };
  return t;
}

/** GY-521 header holes along the +z edge, from −x to +x. */
export const MPU_PINS = ['vcc', 'gnd', 'scl', 'sda', 'xda', 'xcl', 'ad0', 'int'] as const;
export const MPU_DIMS = { pitch: 2.54, rowZ: 6.7, topY: 0.2 } as const;

/** MPU wires run along the top of the fan frame, one layer per pin, and leave past its +x side (x > 35 mm). */
export const MPU_EXIT = { layer0_mm: 2.5, layerStep_mm: 1.8, clearX_mm: 36 } as const;

function mpuAnchors(): AnchorTable {
  const t: AnchorTable = {};
  const { layer0_mm, layerStep_mm, clearX_mm } = MPU_EXIT;
  MPU_PINS.forEach((name, i) => {
    const x = (i - (MPU_PINS.length - 1) / 2) * MPU_DIMS.pitch;
    const y = layer0_mm + i * layerStep_mm;
    const z = MPU_DIMS.rowZ;
    t[name] = {
      pos_mm: [x, MPU_DIMS.topY, z],
      out: PX,
      exit_mm: [
        [x, y, z],
        [clearX_mm, y, z],
      ],
    };
  });
  return t;
}

/**
 * Relay module (local mm): terminal clamps open toward −z, right-angle input headers point +z. Terminal order is the
 * OPEN-5 default, NO–COM–NC from left to right with the terminals facing away (left = −x). The team's board
 * silkscreen reads NC–COM–NO instead; see docs/DECISIONS.md D-023.
 */
export const RELAY_DIMS = {
  terminalX: { no1: -17.5, com1: -12.5, nc1: -7.5, no2: 7.5, com2: 12.5, nc2: 17.5 },
  terminalY: -3,
  headerA: { jdvcc: -13.5, vcc_a: -10.96, gnd_a: -8.42 },
  headerB: { gnd: 2.5, in1: 5.04, in2: 7.58, vcc: 10.12 },
  headerPinY: -6.6,
  halfDepth: 19,
} as const;

function relayAnchors(): AnchorTable {
  const t: AnchorTable = {};
  const { terminalX, terminalY, headerA, headerB, headerPinY, halfDepth } = RELAY_DIMS;
  for (const [name, x] of Object.entries(terminalX)) t[name] = { pos_mm: [x, terminalY, -halfDepth], out: NZ };
  for (const [name, x] of Object.entries({ ...headerA, ...headerB })) {
    t[name] = { pos_mm: [x, headerPinY, halfDepth], out: PZ };
  }
  return t;
}

/** ACS712 module (local mm): clamps open toward −x, header pin tips at +x. */
export const ACS_DIMS = { halfLength: 15.5, clampY: -1, pinY: -3.15, pinPitch: 2.54 } as const;

function acsAnchors(): AnchorTable {
  const { halfLength: h, clampY, pinY, pinPitch: p } = ACS_DIMS;
  return {
    ipPlus: { pos_mm: [-h, clampY, -p], out: NX },
    ipMinus: { pos_mm: [-h, clampY, p], out: NX },
    vcc: { pos_mm: [h, pinY, -p], out: PX },
    out: { pos_mm: [h, pinY, 0], out: PX },
    gnd: { pos_mm: [h, pinY, p], out: PX },
  };
}

/** Breadboard anchors: the reference hole of each rail and node (wires pick a free hole nearby). */
function bbAnchors(): AnchorTable {
  const c = BREADBOARD.center_m;
  const local = (p: Vec3): Vec3 => [(p[0] - c[0]) * 1000, (p[1] - c[1]) * 1000, (p[2] - c[2]) * 1000];
  const t: AnchorTable = {};
  for (const rail of Object.keys(BREADBOARD.railOffset_mm) as BbRail[]) {
    t[`rail${rail}`] = { pos_mm: local(bbRailHole_m(rail, BREADBOARD.centerColumn)), out: UP };
  }
  for (const [node, col] of Object.entries(BB_NODE_COLUMNS)) {
    t[`node.${node}`] = { pos_mm: local(bbHole_m(col, 'c')), out: UP };
  }
  return t;
}

const ANCHORS: Record<string, { component: ComponentId; table: AnchorTable }> = {
  fan: {
    component: 'fan',
    table: {
      black: { pos_mm: [50, -51, -3], out: PX },
      red: { pos_mm: [50, -51, 0], out: PX },
      blue: { pos_mm: [50, -51, 3], out: PX },
    },
  },
  mpu6050: { component: 'mpu6050', table: mpuAnchors() },
  ds18b20: {
    component: 'ds18b20',
    table: {
      red: { pos_mm: [110, -53, 101], out: PX },
      yellow: { pos_mm: [110, -53, 105], out: PX },
      black: { pos_mm: [110, -53, 109], out: PX },
    },
  },
  bb: { component: 'breadboard', table: bbAnchors() },
  esp32: { component: 'esp32', table: esp32Anchors() },
  acs712: { component: 'acs712', table: acsAnchors() },
  relay: { component: 'relay', table: relayAnchors() },
  dcjack: {
    component: 'dcjack',
    table: {
      barrel: { pos_mm: [-12.5, -1.5, 0], out: NX },
      plus: { pos_mm: [12.5, 0, -2.5], out: PX },
      minus: { pos_mm: [12.5, 0, 2.5], out: PX },
    },
  },
  adapter: { component: 'adapter', table: { plug: { pos_mm: [37.5, -5, 0], out: PX } } },
  laptop: {
    component: 'laptop',
    table: {
      usb: { pos_mm: [-160, -102.5, 40], out: NX },
      screenTop: { pos_mm: [0, 106, -104], out: UP },
    },
  },
};

function split(id: string): [string, string] {
  const dot = id.indexOf('.');
  return dot < 0 ? [id, ''] : [id.slice(0, dot), id.slice(dot + 1)];
}

/** True if `id` (e.g. `esp32.D21`, `bb.railL.p`) names a known anchor. */
export function hasAnchor(id: string): boolean {
  const [prefix, pin] = split(id);
  return ANCHORS[prefix]?.table[pin] !== undefined;
}

/** Looks up an anchor; throws on an unknown id. */
export function anchor(id: string): Anchor {
  const [prefix, pin] = split(id);
  const group = ANCHORS[prefix];
  const entry = group?.table[pin];
  if (!group || !entry) throw new Error(`unknown anchor ${id}`);
  return { component: group.component, ...entry };
}

/** World position (m) of a point given in a component's local frame (mm). */
export function localToWorld_m(component: ComponentId, local_mm: Vec3): Vec3 {
  const c = componentById(component);
  const r = rotateY([local_mm[0] / 1000, local_mm[1] / 1000, local_mm[2] / 1000], c.rotY_deg);
  return [c.position_m[0] + r[0], c.position_m[1] + r[1], c.position_m[2] + r[2]];
}

/** World position (m) of an anchor. */
export function worldAnchor_m(id: string): Vec3 {
  const a = anchor(id);
  return localToWorld_m(a.component, a.pos_mm);
}

/** World positions (m) of an anchor's fixed exit points, in order away from the anchor. */
export function worldAnchorExits_m(id: string): Vec3[] {
  const a = anchor(id);
  return (a.exit_mm ?? []).map((p) => localToWorld_m(a.component, p));
}

/** World exit direction (unit) of an anchor. */
export function worldAnchorOut(id: string): Vec3 {
  const a = anchor(id);
  return rotateY(a.out, componentById(a.component).rotY_deg);
}

const NODE_FREE_ROWS: Record<BbNode, readonly BbRow[]> = {
  dq: ['b', 'c', 'd', 'e'], // row a holds r_pu_ds
  tach: ['b', 'c', 'd', 'e'], // row a holds r_pu_tach
  divTop: ['a', 'b', 'c', 'd'], // row e holds r_div_top
  divMid: ['c', 'd'], // rows b and e hold r_div_bot and r_div_top; r_div_bot's body covers row a
};

/** Free holes (world, m) a wire may use for a `bb.*` anchor; empty for other anchors. */
export function bbAnchorHoles_m(id: string): Vec3[] {
  const [prefix, pin] = split(id);
  if (prefix !== 'bb') return [];
  if (pin.startsWith('rail')) {
    const rail = pin.slice('rail'.length) as BbRail;
    return bbRailColumns().map((col) => bbRailHole_m(rail, col));
  }
  const node = pin.slice('node.'.length) as BbNode;
  return NODE_FREE_ROWS[node].map((row) => bbHole_m(BB_NODE_COLUMNS[node], row));
}
