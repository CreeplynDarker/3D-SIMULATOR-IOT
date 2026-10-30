import { useMemo } from 'react';
import { acs712Parts } from './geometry.ts';
import { Parts } from './Parts.tsx';

/** ACS712 current-sensor module. */
export function Acs712() {
  const parts = useMemo(acs712Parts, []);
  return <Parts parts={parts} />;
}
