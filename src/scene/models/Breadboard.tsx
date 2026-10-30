import { useMemo } from 'react';
import { breadboardParts } from './geometry.ts';
import { Parts } from './Parts.tsx';

/** 830-point breadboard. */
export function Breadboard() {
  const parts = useMemo(breadboardParts, []);
  return <Parts parts={parts} />;
}
