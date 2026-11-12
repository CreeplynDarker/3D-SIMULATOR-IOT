import { useMemo } from 'react';
import { BREADBOARD, componentById, RESISTOR_HOLES_m, type ResistorId } from '../../shared/components.ts';
import { Cable } from './Cable.tsx';
import { RESISTOR_BANDS, resistorParts } from './geometry.ts';
import type { V3 } from './parts.ts';
import { Parts } from './Parts.tsx';

/** Half the distance between a resistor's two holes (mm): its leads bend down there. */
function leadHalf_mm(id: ResistorId): number {
  const [a, b] = RESISTOR_HOLES_m[id];
  return (Math.hypot(a[0] - b[0], a[2] - b[2]) * 1000) / 2;
}

/** Axial resistor with its colour bands and two leads bent down into its two breadboard holes. */
export function Resistor({ id }: { id: ResistorId }) {
  const parts = useMemo(() => resistorParts(RESISTOR_BANDS[id]), [id]);
  const leads = useMemo(() => {
    const drop_mm = (componentById(id).position_m[1] - BREADBOARD.topY_m) * 1000 + 1;
    const half = leadHalf_mm(id);
    return [-1, 1].map((side): V3[] => [
      [side * 2.9, 0, 0],
      [side * half, -0.2, 0],
      [side * half, -drop_mm, 0],
    ]);
  }, [id]);
  return (
    <>
      <Parts parts={parts} />
      {leads.map((points, i) => (
        <Cable key={i} points={points} radius_mm={0.25} color="#c0c0c0" metal />
      ))}
    </>
  );
}
