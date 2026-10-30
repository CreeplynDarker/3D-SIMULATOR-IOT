import { useMemo } from 'react';
import { relayParts } from './geometry.ts';
import { Parts } from './Parts.tsx';

/** 2-channel relay module (only CH2 is wired). */
export function Relay() {
  const parts = useMemo(relayParts, []);
  return <Parts parts={parts} />;
}
