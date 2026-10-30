import { useMemo } from 'react';
import { adapterParts } from './geometry.ts';
import { Parts } from './Parts.tsx';

/** JSY-1220 12 V wall adapter. */
export function Adapter() {
  const parts = useMemo(adapterParts, []);
  return <Parts parts={parts} />;
}
