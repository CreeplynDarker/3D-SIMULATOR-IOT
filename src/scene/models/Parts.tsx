import type {} from '@react-three/fiber'; // registers <mesh>, <group>, … as JSX elements
import { useEffect, useMemo } from 'react';
import type { BufferGeometry, Material } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial } from './materials.ts';
import { type Part, partGeometry } from './parts.ts';

interface MeshSpec {
  key: string;
  geometry: BufferGeometry;
  material: Material | Material[];
}

const BOX_FACE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 } as const;

/** Box with a texture on one face and the plain material elsewhere. */
function texturedMaterial(p: Part): Material | Material[] {
  const plain = getMaterial(p.mat, p.color);
  const textured = getMaterial(p.mat, p.color, p.tex);
  if (p.kind !== 'box') return textured;
  const face = BOX_FACE[p.texFace ?? 'py'];
  return Array.from({ length: 6 }, (_, i) => (i === face ? textured : plain));
}

/** Untextured parts merge into one mesh per material; textured parts stay separate. */
function buildMeshes(parts: readonly Part[]): MeshSpec[] {
  const out: MeshSpec[] = [];
  const buckets = new Map<string, BufferGeometry[]>();
  parts.forEach((p, i) => {
    const g = partGeometry(p);
    if (p.tex) {
      out.push({ key: `tex:${i}`, geometry: g, material: texturedMaterial(p) });
      return;
    }
    const id = `${p.mat}|${p.color ?? ''}`;
    const flat = g.index ? g.toNonIndexed() : g;
    flat.clearGroups();
    buckets.set(id, [...(buckets.get(id) ?? []), flat]);
  });
  for (const [id, geoms] of buckets) {
    const merged = mergeGeometries(geoms);
    if (!merged) throw new Error(`could not merge parts for ${id}`);
    const [mat, color] = id.split('|') as [Part['mat'], string];
    out.push({ key: id, geometry: merged, material: getMaterial(mat, color || undefined) });
  }
  return out;
}

/** Renders a part list given in mm; `group` names become child groups (e.g. "blades") for later animation. */
export function Parts({ parts }: { parts: readonly Part[] }) {
  const groups = useMemo(() => {
    const byGroup = new Map<string, Part[]>();
    for (const p of parts) byGroup.set(p.group ?? '', [...(byGroup.get(p.group ?? '') ?? []), p]);
    return [...byGroup].map(([name, list]) => ({ name, meshes: buildMeshes(list) }));
  }, [parts]);

  useEffect(() => () => groups.forEach((g) => g.meshes.forEach((m) => m.geometry.dispose())), [groups]);

  return (
    <group scale={0.001}>
      {groups.map(({ name, meshes }) => (
        <group key={name || 'static'} name={name || 'static'}>
          {meshes.map((m) => (
            <mesh key={m.key} geometry={m.geometry} material={m.material} castShadow receiveShadow />
          ))}
        </group>
      ))}
    </group>
  );
}
