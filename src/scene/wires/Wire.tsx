import type {} from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import type { Vec3 } from '../../shared/components.ts';
import { getMaterial } from '../models/materials.ts';
import { WIRE_RADIUS_m } from './route.ts';

interface WireProps {
  /** Control points in world metres (from `route.ts`). */
  points_m: readonly Vec3[];
  color: string;
  radius_m?: number;
  name?: string;
}

/** One wire: a tube along a centripetal Catmull–Rom curve through its route points. */
export function Wire({ points_m, color, radius_m = WIRE_RADIUS_m, name = 'wire' }: WireProps) {
  const geometry = useMemo(() => {
    const curve = new CatmullRomCurve3(
      points_m.map((p) => new Vector3(...p)),
      false,
      'centripetal',
    );
    return new TubeGeometry(curve, 96, radius_m, 8, false);
  }, [points_m, radius_m]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh name={name} geometry={geometry} material={getMaterial('paint', color)} castShadow />;
}
