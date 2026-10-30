import { useMemo } from 'react';
import { anchor } from '../anchors.ts';
import { Cable } from './Cable.tsx';
import { ds18b20Parts } from './geometry.ts';
import { getMaterial } from './materials.ts';
import type { V3 } from './parts.ts';
import { Parts } from './Parts.tsx';

// The 1 m cable runs from the probe down behind the fan to a coil on the bench; three leads leave the coil.
const COIL = { center: [80, -51.8, 71] as V3, R: 18, r: 2.2 };
const JACKET: V3[] = [
  [25, 0, 0],
  [34, -6, -8],
  [44, -40, -16],
  [50, -51.8, -10],
  [60, -51.8, 45],
  [62, -51.8, 71],
];
const LEADS = [
  { id: 'ds18b20.red', color: '#d32f2f' },
  { id: 'ds18b20.yellow', color: '#fdd835' },
  { id: 'ds18b20.black', color: '#212121' },
] as const;

/** Lead from the coil exit to its anchor, in the probe frame (mm). */
function leadPath(id: string, i: number): V3[] {
  const [cx, cy, cz] = COIL.center;
  const exit: V3 = [cx + COIL.R, cy, cz];
  const end = anchor(id).pos_mm;
  return [exit, [exit[0] + 4, cy, cz + 6 + i], [end[0] - 6, end[1], end[2] - 4], end];
}

/** DS18B20 probe with its coiled cable and three leads (the cable is outside the probe's bounding box). */
export function Ds18b20() {
  const parts = useMemo(ds18b20Parts, []);
  const leads = useMemo(() => LEADS.map((l, i) => ({ ...l, points: leadPath(l.id, i) })), []);
  const [cx, cy, cz] = COIL.center;
  return (
    <>
      <Parts parts={parts} />
      <Cable points={JACKET} radius_mm={2} color="#151515" />
      <mesh
        position={[cx / 1000, cy / 1000, cz / 1000]}
        rotation={[Math.PI / 2, 0, 0]}
        material={getMaterial('paint', '#151515')}
        castShadow
      >
        <torusGeometry args={[COIL.R / 1000, COIL.r / 1000, 10, 48]} />
      </mesh>
      {leads.map((l) => (
        <Cable key={l.id} points={l.points} radius_mm={0.6} color={l.color} />
      ))}
    </>
  );
}
