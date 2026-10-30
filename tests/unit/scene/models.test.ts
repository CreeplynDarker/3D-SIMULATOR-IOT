import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPONENTS } from '../../../src/shared/components.ts';
import { MODEL_PARTS } from '../../../src/scene/models/geometry.ts';
import { partsBounds } from '../../../src/scene/models/parts.ts';

describe('model geometry (§13.2 sizes)', () => {
  for (const c of COMPONENTS) {
    it(`${c.id} bounding box is within 5% of ${c.size_mm.join(' × ')} mm`, () => {
      const parts = MODEL_PARTS[c.id]();
      expect(parts.length).toBeGreaterThan(0);
      const { size } = partsBounds(parts);
      size.forEach((s, k) => {
        const want = c.size_mm[k] ?? 0;
        expect(Math.abs(s - want) / want, `axis ${'xyz'[k]}: ${s.toFixed(2)} vs ${want}`).toBeLessThanOrEqual(0.05);
      });
    });
  }

  it('the fan has 7 blades in the rotating group', () => {
    expect(MODEL_PARTS.fan().filter((p) => p.group === 'blades')).toHaveLength(7);
  });

  it('the ESP32 has 30 header pins', () => {
    expect(MODEL_PARTS.esp32().filter((p) => p.name?.startsWith('pin:'))).toHaveLength(30);
  });
});

describe('public assets', () => {
  it('GLB and texture files in public/ total under 5 MB', () => {
    const publicDir = resolve(import.meta.dirname, '../../../public');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const assets = walk(publicDir).filter((f) => /\.(glb|gltf|png|jpe?g|webp|ktx2|hdr)$/i.test(f));
    const total_B = assets.reduce((sum, f) => sum + statSync(f).size, 0);
    expect(total_B).toBeLessThan(5 * 1024 * 1024);
  });
});
