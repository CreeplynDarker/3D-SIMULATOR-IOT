import { useEffect, useMemo } from 'react';
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import { getMaterial } from './materials.ts';
import type { V3 } from './parts.ts';

interface CableProps {
  /** Control points in mm (the parent model's frame). */
  points: readonly V3[];
  radius_mm: number;
  color: string;
  metal?: boolean;
}

/** A smooth cable (tube along a Catmull–Rom curve) drawn in millimetres. */
export function Cable({ points, radius_mm, color, metal = false }: CableProps) {
  const geometry = useMemo(() => {
    const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)));
    return new TubeGeometry(curve, Math.max(24, points.length * 12), radius_mm, 8, false);
  }, [points, radius_mm]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group scale={0.001}>
      <mesh geometry={geometry} material={getMaterial(metal ? 'metal' : 'paint', color)} castShadow />
    </group>
  );
}
