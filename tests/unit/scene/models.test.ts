import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPONENTS } from '../../../src/shared/components.ts';
import { MODEL_PARTS } from '../../../src/scene/models/geometry.ts';
import { INSTANCE_MIN, partsBounds, planInstances, sameShape } from '../../../src/scene/models/parts.ts';

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

/** Width and height of a WebP file from its header (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(b: Buffer): [number, number] {
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  if (chunk === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  throw new Error(`not a WebP: ${chunk}`);
}

describe('photo textures (P7.2)', () => {
  const dir = resolve(import.meta.dirname, '../../../public/textures');
  const files = readdirSync(dir);

  it('are WebP, at most 1024 px on a side, and smaller in total than the 303 kB of JPEGs they replace', () => {
    expect(files.length).toBe(8);
    for (const f of files) {
      expect(f, f).toMatch(/\.webp$/);
      const [w, h] = webpSize(readFileSync(join(dir, f)));
      expect(Math.max(w, h), f).toBeLessThanOrEqual(1024);
      expect(Math.min(w, h), f).toBeGreaterThan(100);
    }
    const total_B = files.reduce((s, f) => s + statSync(join(dir, f)).size, 0);
    expect(total_B).toBeLessThan(303_055);
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

describe('instancing plan (P7.2)', () => {
  it('turns repeated identical untextured parts into instance groups and leaves the rest to merge', () => {
    const esp = MODEL_PARTS.esp32();
    const plan = planInstances(esp, INSTANCE_MIN);
    const pins = plan.instanced.find((g) => g.proto.kind === 'box' && g.proto.mat === 'metal');
    expect(pins?.positions).toHaveLength(30);
    expect(plan.instanced.find((g) => g.proto.mat === 'solder')?.positions).toHaveLength(30);
    expect(plan.rest.every((p) => p.tex !== undefined || !plan.instanced.some((g) => sameShape(g.proto, p)))).toBe(true); // prettier-ignore
    expect(plan.rest.length + plan.instanced.reduce((n, g) => n + g.positions.length, 0)).toBe(esp.length);
    // textured or few parts never instance
    expect(planInstances(MODEL_PARTS.breadboard(), INSTANCE_MIN).instanced).toEqual([]);
    expect(planInstances(MODEL_PARTS.fan(), INSTANCE_MIN).instanced).toEqual([]); // 7 blades each with its own rotation
  });
});
