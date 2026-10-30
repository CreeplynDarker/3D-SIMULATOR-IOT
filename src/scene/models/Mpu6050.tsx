import { useMemo } from 'react';
import { mpuParts } from './geometry.ts';
import { Parts } from './Parts.tsx';

/** GY-521 MPU6050 board. */
export function Mpu6050() {
  const parts = useMemo(mpuParts, []);
  return <Parts parts={parts} />;
}
