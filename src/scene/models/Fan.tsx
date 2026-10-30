import { useMemo } from 'react';
import { anchor } from '../anchors.ts';
import { Cable } from './Cable.tsx';
import { fanParts } from './geometry.ts';
import { box, type Part, type V3 } from './parts.ts';
import { Parts } from './Parts.tsx';

const LEADS = [
  { id: 'fan.black', color: '#212121' },
  { id: 'fan.red', color: '#d32f2f' },
  { id: 'fan.blue', color: '#1e88e5' },
] as const;

/** Lead from the frame's +x side down to its cable end (anchor), in the fan frame (mm). */
function leadPath(id: string): V3[] {
  const end = anchor(id).pos_mm;
  const z = end[2];
  return [[33, 24, z * 0.5], [39, 18, z * 0.7], [44, -20, z], [48.5, -46, z], end];
}

/** Delta AFB0712HB fan with its three leads; blades are the "blades" group. */
export function Fan() {
  const parts = useMemo(fanParts, []);
  const leads = useMemo(() => LEADS.map((l) => ({ ...l, points: leadPath(l.id) })), []);
  return (
    <>
      <Parts parts={parts} />
      {leads.map((l) => (
        <Cable key={l.id} points={l.points} radius_mm={0.6} color={l.color} />
      ))}
    </>
  );
}

const STAND: Part[] = [
  box([80, 3, 40], [0, -53.5, 0], 'paint', { color: '#c9c6bf' }),
  box([10, 17, 12], [-25, -43.5, 0], 'paint', { color: '#c9c6bf' }),
  box([10, 17, 12], [25, -43.5, 0], 'paint', { color: '#c9c6bf' }),
];

/** 20 mm stand under the fan, in the fan frame (not part of the fan's bounding box). */
export function FanStand() {
  return <Parts parts={STAND} />;
}
