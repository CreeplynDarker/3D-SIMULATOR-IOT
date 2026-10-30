import { useMemo } from 'react';
import { laptopParts } from './geometry.ts';
import { Parts } from './Parts.tsx';

/** Laptop running the RCF and the dashboard. */
export function Laptop() {
  const parts = useMemo(laptopParts, []);
  return <Parts parts={parts} />;
}
