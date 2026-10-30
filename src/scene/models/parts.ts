// Procedural model primitives. Every model is a list of parts in millimetres around its bounding-box centre, so its
// size can be checked in Node (tests) and the same list is merged into a few meshes for rendering.
import {
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Matrix4,
  Path,
  Quaternion,
  Shape,
  Vector3,
} from 'three';

export type V3 = readonly [number, number, number];

export type MaterialKey =
  | 'pcbBlack'
  | 'pcbBlue'
  | 'plasticBlack'
  | 'plasticWhite'
  | 'fanBlack'
  | 'relayBlue'
  | 'terminalBlue'
  | 'terminalGreen'
  | 'metal'
  | 'gold'
  | 'steel'
  | 'solder'
  | 'chip'
  | 'hole'
  | 'label'
  | 'laptopBody'
  | 'laptopKeys'
  | 'tape'
  | 'resistorBody'
  | 'paint'
  | 'led';

/** Photo crops in public/textures/ plus two textures drawn at run time (breadboard, laptop screen). */
export type TextureKey =
  | 'esp32-pcb'
  | 'esp32-shield'
  | 'relay-pcb'
  | 'relay-ch1'
  | 'relay-ch2'
  | 'acs712-pcb'
  | 'fan-hub'
  | 'adapter-label'
  | 'breadboard'
  | 'screen';

interface PartBase {
  /** Centre in mm. */
  pos: V3;
  /** Euler angles in radians. */
  rot?: V3;
  order?: 'XYZ' | 'ZYX';
  mat: MaterialKey;
  /** Overrides the material colour (paint, LEDs, cable). */
  color?: string;
  tex?: TextureKey;
  /** Box face that carries `tex` (default: top). */
  texFace?: 'py' | 'pz';
  /** Parts sharing a group render as their own mesh (e.g. rotating blades, LEDs). */
  group?: string;
  name?: string;
}

export type Part =
  | (PartBase & { kind: 'box'; size: V3 })
  | (PartBase & { kind: 'cyl'; r: number; len: number; axis: 'x' | 'y' | 'z'; seg?: number })
  | (PartBase & { kind: 'disc'; r: number })
  | (PartBase & { kind: 'frame'; outer: number; holeR: number; depth: number; mountR: number; mountInset: number });

/** Size of a part before rotation (mm). */
function localSize(p: Part): V3 {
  switch (p.kind) {
    case 'box':
      return p.size;
    case 'cyl':
      if (p.axis === 'x') return [p.len, 2 * p.r, 2 * p.r];
      if (p.axis === 'y') return [2 * p.r, p.len, 2 * p.r];
      return [2 * p.r, 2 * p.r, p.len];
    case 'disc':
      return [2 * p.r, 2 * p.r, 0];
    case 'frame':
      return [p.outer, p.outer, p.depth];
  }
}

/** Transform from a part's local frame to the model frame (mm). */
export function partMatrix(p: Part): Matrix4 {
  const [rx, ry, rz] = p.rot ?? [0, 0, 0];
  const q = new Quaternion().setFromEuler(new Euler(rx, ry, rz, p.order ?? 'XYZ'));
  return new Matrix4().compose(new Vector3(...p.pos), q, new Vector3(1, 1, 1));
}

/** Axis-aligned bounds of a part list (mm). */
export function partsBounds(parts: readonly Part[]): { min: V3; max: V3; size: V3 } {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of parts) {
    const [sx, sy, sz] = localSize(p).map((s) => s / 2) as unknown as [number, number, number];
    const m = partMatrix(p);
    for (const cx of [-sx, sx])
      for (const cy of [-sy, sy])
        for (const cz of [-sz, sz]) {
          const v = new Vector3(cx, cy, cz).applyMatrix4(m);
          min.min(v);
          max.max(v);
        }
  }
  return {
    min: [min.x, min.y, min.z],
    max: [max.x, max.y, max.z],
    size: [max.x - min.x, max.y - min.y, max.z - min.z],
  };
}

function frameGeometry(p: Extract<Part, { kind: 'frame' }>): BufferGeometry {
  const h = p.outer / 2;
  const shape = new Shape();
  shape.moveTo(-h, -h).lineTo(h, -h).lineTo(h, h).lineTo(-h, h).lineTo(-h, -h);
  shape.holes.push(new Path().absarc(0, 0, p.holeR, 0, Math.PI * 2, true));
  const c = h - p.mountInset;
  for (const [x, y] of [
    [-c, -c],
    [c, -c],
    [c, c],
    [-c, c],
  ] as const) {
    shape.holes.push(new Path().absarc(x, y, p.mountR, 0, Math.PI * 2, true));
  }
  const g = new ExtrudeGeometry(shape, { depth: p.depth, bevelEnabled: false, curveSegments: 48 });
  return g.translate(0, 0, -p.depth / 2);
}

/** three.js geometry of a part, already placed in the model frame (mm). */
export function partGeometry(p: Part): BufferGeometry {
  let g: BufferGeometry;
  switch (p.kind) {
    case 'box':
      g = new BoxGeometry(...p.size);
      break;
    case 'cyl':
      g = new CylinderGeometry(p.r, p.r, p.len, p.seg ?? 20);
      if (p.axis === 'x') g.rotateZ(-Math.PI / 2);
      if (p.axis === 'z') g.rotateX(Math.PI / 2);
      break;
    case 'disc':
      g = new CircleGeometry(p.r, 48);
      break;
    case 'frame':
      g = frameGeometry(p);
      break;
  }
  return g.applyMatrix4(partMatrix(p));
}

// Small builders keep the model files readable.
type Extra = Partial<PartBase> & { seg?: number };

/** Box part: size and centre in mm. */
export const box = (size: V3, pos: V3, mat: MaterialKey, extra: Extra = {}): Part => ({
  kind: 'box',
  size,
  pos,
  mat,
  ...extra,
});

/** Cylinder part: radius and length in mm along `axis`. */
export const cyl = (
  r: number,
  len: number,
  axis: 'x' | 'y' | 'z',
  pos: V3,
  mat: MaterialKey,
  extra: Extra = {},
): Part => ({
  kind: 'cyl',
  r,
  len,
  axis,
  pos,
  mat,
  ...extra,
});
