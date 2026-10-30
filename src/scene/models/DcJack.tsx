import { useMemo } from 'react';
import { dcjackParts } from './geometry.ts';
import { Parts } from './Parts.tsx';

/** Female barrel jack with screw terminals (OPEN-6). */
export function DcJack() {
  const parts = useMemo(dcjackParts, []);
  return <Parts parts={parts} />;
}
