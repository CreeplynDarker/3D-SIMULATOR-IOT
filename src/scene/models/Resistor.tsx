import { useMemo } from 'react';
import { BREADBOARD, componentById } from '../../shared/components.ts';
import { Cable } from './Cable.tsx';
import { RESISTOR_BANDS, resistorParts } from './geometry.ts';
import type { V3 } from './parts.ts';
import { Parts } from './Parts.tsx';

export type ResistorId = keyof typeof RESISTOR_BANDS;

/** Hole half-spacing along the body (mm): every resistor spans three pitches (7.62 mm). */
const LEAD_HALF_mm = 1.5 * BREADBOARD.pitch_mm;

/** Axial resistor with its colour bands and two leads bent down into the breadboard. */
export function Resistor({ id }: { id: ResistorId }) {
  const parts = useMemo(() => resistorParts(RESISTOR_BANDS[id]), [id]);
  const leads = useMemo(() => {
    const drop_mm = (componentById(id).position_m[1] - BREADBOARD.topY_m) * 1000 + 1;
    return [-1, 1].map((side): V3[] => [
      [side * 2.9, 0, 0],
      [side * LEAD_HALF_mm, -0.2, 0],
      [side * LEAD_HALF_mm, -drop_mm, 0],
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
