// pnpm gen:textures — crops the team's photos (assets/photos/) into PCB textures (public/textures/).
// Uses the Playwright Chromium already installed for e2e, so no image library is needed.
// Each crop is a rectangle in fractions of the photo, turned so the output's right edge is +x and its top is −z
// (the +y face UV of a three.js box).
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

interface Crop {
  out: string;
  src: string;
  /** [left, top, right, bottom] as fractions of the photo. */
  rect: [number, number, number, number];
  /** Clockwise quarter turns applied after cropping. */
  turns: 0 | 1 | 3;
  width_px: number;
  height_px: number;
}

const CROPS: Crop[] = [
  { out: 'esp32-pcb.webp', src: 'esp32.jpg', rect: [0.293, 0.17, 0.762, 0.812], turns: 1, width_px: 1024, height_px: 552 },
  { out: 'esp32-shield.webp', src: 'esp32.jpg', rect: [0.382, 0.247, 0.652, 0.478], turns: 1, width_px: 384, height_px: 336 },
  { out: 'relay-pcb.webp', src: 'relay-closeup.png', rect: [0.02, 0.012, 0.985, 0.99], turns: 0, width_px: 1024, height_px: 778 },
  { out: 'relay-ch1.webp', src: 'relay-closeup.png', rect: [0.09, 0.225, 0.515, 0.64], turns: 0, width_px: 256, height_px: 312 },
  { out: 'relay-ch2.webp', src: 'relay-closeup.png', rect: [0.535, 0.225, 0.965, 0.63], turns: 0, width_px: 256, height_px: 312 },
  { out: 'acs712-pcb.webp', src: 'acs712.jpg', rect: [0.272, 0.44, 0.64, 0.648], turns: 0, width_px: 1024, height_px: 430 },
  { out: 'fan-hub.webp', src: 'fan-closeup.png', rect: [0.335, 0.34, 0.705, 0.71], turns: 0, width_px: 512, height_px: 512 },
  { out: 'adapter-label.webp', src: 'adapter.jpg', rect: [0.448, 0.53, 0.785, 0.875], turns: 3, width_px: 600, height_px: 448 },
]; // prettier-ignore

// WebP at 0.85: about a third smaller than JPEG at the same quality, decoded by every current browser (P7.2, D-066).
const WEBP_QUALITY = 0.85;
const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'public/textures');
mkdirSync(outDir, { recursive: true });

// PW_CHROMIUM_PATH: a preinstalled Chromium when the pinned Playwright's own build is absent (as for the e2e tests).
const executablePath = process.env['PW_CHROMIUM_PATH'];
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
for (const crop of CROPS) {
  const bytes = readFileSync(join(root, 'assets/photos', crop.src));
  const mime = crop.src.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const dataUrl = await page.evaluate(
    async ({ src, rect, turns, width_px, height_px, quality }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const [l, t, r, b] = rect;
      const sx = l * img.naturalWidth;
      const sy = t * img.naturalHeight;
      const sw = (r - l) * img.naturalWidth;
      const sh = (b - t) * img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = width_px;
      canvas.height = height_px;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.translate(width_px / 2, height_px / 2);
      ctx.rotate((turns * Math.PI) / 2);
      const [dw, dh] = turns % 2 === 0 ? [width_px, height_px] : [height_px, width_px];
      ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
      return canvas.toDataURL('image/webp', quality);
    },
    { ...crop, src: `data:${mime};base64,${bytes.toString('base64')}`, quality: WEBP_QUALITY },
  );
  const file = join(outDir, crop.out);
  writeFileSync(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
  process.stdout.write(`wrote ${file} (${Math.round(statSync(file).size / 1024)} kB)\n`);
}
await browser.close();
