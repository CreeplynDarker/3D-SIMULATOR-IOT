import { useMemo } from 'react';
import { esp32Parts } from './geometry.ts';
import { Parts } from './Parts.tsx';

/** ESP32 DevKit V1 (30 pins). */
export function Esp32() {
  const parts = useMemo(esp32Parts, []);
  return <Parts parts={parts} />;
}
