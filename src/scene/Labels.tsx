// `tgl-labels`: a name tag above each main part, drawn on a canvas sprite (no font is fetched, AGENTS.md rule 11).
import { useMemo } from 'react';
import { CanvasTexture, SpriteMaterial, SRGBColorSpace } from 'three';
import { type ComponentId, componentById } from '../shared/components.ts';
import { useAppStore } from '../store/index.ts';
import { animDebug } from './animDebug.ts';

const LABELS: { id: ComponentId; text: string }[] = [
  { id: 'fan', text: 'Fan 12 V' },
  { id: 'mpu6050', text: 'MPU6050' },
  { id: 'ds18b20', text: 'DS18B20' },
  { id: 'breadboard', text: 'Breadboard' },
  { id: 'esp32', text: 'ESP32' },
  { id: 'acs712', text: 'ACS712' },
  { id: 'relay', text: 'Relay CH2' },
  { id: 'dcjack', text: 'DC jack' },
  { id: 'adapter', text: '12 V adapter' },
  { id: 'laptop', text: 'Laptop (RCF)' },
];
const CANVAS = { w: 256, h: 64, font: '600 30px system-ui, sans-serif' };
const SIZE_m = { w: 0.048, h: 0.012, gap: 0.01 };

/** A rounded dark tag with white text. */
function tagMaterial(text: string): SpriteMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS.w;
  canvas.height = CANVAS.h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(15,23,42,0.78)';
    ctx.beginPath();
    ctx.roundRect(2, 2, CANVAS.w - 4, CANVAS.h - 4, 14);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.font = CANVAS.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, CANVAS.w / 2, CANVAS.h / 2 + 1);
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  return new SpriteMaterial({ map, depthTest: false, transparent: true });
}

/** Name tags, shown while `ui.toggles.labels` is on. */
export function Labels() {
  const on = useAppStore((s) => s.ui.toggles.labels);
  const tags = useMemo(
    () =>
      LABELS.map(({ id, text }) => {
        const c = componentById(id);
        const top = c.position_m[1] + c.size_mm[1] / 2000 + SIZE_m.gap;
        return { id, material: tagMaterial(text), position: [c.position_m[0], top, c.position_m[2]] as const };
      }),
    [],
  );
  animDebug.labels = on ? tags.length : 0;
  if (!on) return null;
  return (
    <group name="labels">
      {tags.map((t) => (
        <sprite
          key={t.id}
          position={[...t.position]}
          material={t.material}
          scale={[SIZE_m.w, SIZE_m.h, 1]}
          renderOrder={10}
        />
      ))}
    </group>
  );
}
