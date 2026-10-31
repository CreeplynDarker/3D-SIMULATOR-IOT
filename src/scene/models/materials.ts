// Shared materials and textures for the procedural models. Photo crops load from public/textures/; the breadboard
// and the laptop screen are drawn on canvases so their holes and text line up with the model exactly.
import {
  AdditiveBlending,
  CanvasTexture,
  type Material,
  MeshStandardMaterial,
  SpriteMaterial,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from 'three';
import { BREADBOARD, type BbRail, bbRailColumns } from '../../shared/components.ts';
import type { MaterialKey, TextureKey } from './parts.ts';

interface MatDef {
  color: string;
  roughness: number;
  metalness: number;
}

const DEFS: Record<MaterialKey, MatDef> = {
  pcbBlack: { color: '#1a1a1a', roughness: 0.55, metalness: 0.1 },
  pcbBlue: { color: '#1d4fa0', roughness: 0.55, metalness: 0.1 },
  plasticBlack: { color: '#1c1c1e', roughness: 0.75, metalness: 0 },
  plasticWhite: { color: '#f1eee6', roughness: 0.8, metalness: 0 },
  fanBlack: { color: '#222225', roughness: 0.85, metalness: 0 },
  relayBlue: { color: '#2f7fd8', roughness: 0.6, metalness: 0 },
  terminalBlue: { color: '#2563c9', roughness: 0.6, metalness: 0 },
  terminalGreen: { color: '#1f8a4c', roughness: 0.6, metalness: 0 },
  metal: { color: '#c9c9cc', roughness: 0.3, metalness: 0.9 },
  gold: { color: '#d4af37', roughness: 0.35, metalness: 1 },
  steel: { color: '#dfe2e6', roughness: 0.2, metalness: 1 },
  solder: { color: '#b9b9bd', roughness: 0.35, metalness: 0.85 },
  chip: { color: '#121212', roughness: 0.5, metalness: 0.1 },
  hole: { color: '#050505', roughness: 1, metalness: 0 },
  label: { color: '#ffffff', roughness: 0.7, metalness: 0 },
  laptopBody: { color: '#3b3e44', roughness: 0.45, metalness: 0.55 },
  laptopKeys: { color: '#16181b', roughness: 0.8, metalness: 0 },
  tape: { color: '#e7e6dc', roughness: 0.9, metalness: 0 },
  resistorBody: { color: '#d9c08a', roughness: 0.6, metalness: 0 },
  paint: { color: '#888888', roughness: 0.6, metalness: 0 },
  led: { color: '#ff2a2a', roughness: 0.4, metalness: 0 },
};

const PHOTO_TEXTURES: readonly TextureKey[] = [
  'esp32-pcb',
  'esp32-shield',
  'relay-pcb',
  'relay-ch1',
  'relay-ch2',
  'acs712-pcb',
  'fan-hub',
  'adapter-label',
];

const textures = new Map<TextureKey, Texture>();
const materials = new Map<string, Material>();
const loader = new TextureLoader();

function canvas2d(width_px: number, height_px: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width_px;
  canvas.height = height_px;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [canvas, ctx];
}

// Breadboard texture width: 1024 px over 165 mm is ~6 px per mm, enough for the 1 mm holes (P7.2; 2048 px before).
const BREADBOARD_TEX_px = 1024;

/** Breadboard top: 630 strip holes, 200 rail holes, rail stripes, centre channel and labels, to scale. */
function drawBreadboard(): HTMLCanvasElement {
  const [L, W] = [165, 55]; // board size in mm
  const s = BREADBOARD_TEX_px / L; // px per mm
  const [canvas, ctx] = canvas2d(BREADBOARD_TEX_px, Math.round(W * s));
  const u = (xLocal_mm: number) => (xLocal_mm + L / 2) * s;
  const v = (zLocal_mm: number) => (zLocal_mm + W / 2) * s;
  const colX = (col: number) => (BREADBOARD.centerColumn - col) * BREADBOARD.pitch_mm;
  ctx.fillStyle = '#f1eee6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#d9d4c7';
  ctx.fillRect(0, v(-1.6), canvas.width, 3.2 * s);
  const hole = (x: number, z: number) => ctx.fillRect(u(x) - 0.55 * s, v(z) - 0.55 * s, 1.1 * s, 1.1 * s);
  ctx.fillStyle = '#2a2a2a';
  for (let col = 1; col <= BREADBOARD.columns; col++) {
    for (const off of Object.values(BREADBOARD.rowOffset_mm)) hole(colX(col), off);
  }
  for (const rail of Object.keys(BREADBOARD.railOffset_mm) as BbRail[]) {
    for (const col of bbRailColumns()) hole(colX(col), BREADBOARD.railOffset_mm[rail]);
  }
  const stripe = (z: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(u(colX(62)), v(z) - 0.25 * s, (colX(2) - colX(62)) * s, 0.5 * s);
  };
  stripe(-23.9, '#d32f2f');
  stripe(-16.8, '#1e88e5');
  stripe(16.8, '#d32f2f');
  stripe(23.9, '#1e88e5');
  ctx.fillStyle = '#8a8478';
  ctx.font = `${Math.round(1.6 * s)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let col = 1; col <= BREADBOARD.columns; col += col === 1 ? 4 : 5)
    ctx.fillText(String(col), u(colX(col)), v(-15.6));
  for (const [row, off] of Object.entries(BREADBOARD.rowOffset_mm)) ctx.fillText(row, u(colX(1) + 2.6), v(off));
  return canvas;
}

/** Laptop screen: a static mini dashboard (state, RCF score, a chart strip). */
function drawScreen(): HTMLCanvasElement {
  const [canvas, ctx] = canvas2d(1024, 632);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 1024, 632);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText('PdM monitor · Grupo 7', 40, 70);
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(40, 110, 220, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('NORMAL', 70, 155);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '30px sans-serif';
  ctx.fillText('RCF score 0.21 / 0.50 · dominant: cf', 300, 152);
  ctx.strokeStyle = '#334155';
  ctx.strokeRect(40, 220, 944, 360);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const x = 40 + (i / 60) * 944;
    const y = 420 + 40 * Math.sin(i / 4) * Math.cos(i / 11);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.strokeStyle = '#ef4444';
  ctx.setLineDash([16, 12]);
  ctx.beginPath();
  ctx.moveTo(40, 300);
  ctx.lineTo(984, 300);
  ctx.stroke();
  return canvas;
}

let photosPending = 0;

/** True once every photo texture requested so far has finished loading. */
export function photoTexturesReady(): boolean {
  return textures.size > 0 && photosPending === 0;
}

function loadPhoto(key: TextureKey): Texture {
  photosPending++;
  const done = () => photosPending--;
  return loader.load(`${import.meta.env.BASE_URL}textures/${key}.webp`, done, undefined, done);
}

/** Texture for a key; photo crops load asynchronously and appear when ready. */
export function getTexture(key: TextureKey): Texture {
  const cached = textures.get(key);
  if (cached) return cached;
  let tex: Texture;
  if (key === 'breadboard') tex = new CanvasTexture(drawBreadboard());
  else if (key === 'screen') tex = new CanvasTexture(drawScreen());
  else if (PHOTO_TEXTURES.includes(key)) tex = loadPhoto(key);
  else throw new Error(`unknown texture ${key}`);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  textures.set(key, tex);
  return tex;
}

let glowTexture: CanvasTexture | null = null;

/** Additive halo for an LED (radial falloff), so LEDs glow without a post-processing pass. */
export function getGlowMaterial(color = DEFS.led.color): SpriteMaterial {
  const id = `glow|${color}`;
  const cached = materials.get(id);
  if (cached instanceof SpriteMaterial) return cached;
  if (!glowTexture) {
    const [canvas, ctx] = canvas2d(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    glowTexture = new CanvasTexture(canvas);
  }
  const m = new SpriteMaterial({
    map: glowTexture,
    color,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  materials.set(id, m);
  return m;
}

/** Shared material for a key, optional colour override and optional texture map. */
export function getMaterial(key: MaterialKey, color?: string, tex?: TextureKey): Material {
  const id = `${key}|${color ?? ''}|${tex ?? ''}`;
  const cached = materials.get(id);
  if (cached) return cached;
  const def = DEFS[key];
  const m = new MeshStandardMaterial({
    color: tex ? '#ffffff' : (color ?? def.color),
    roughness: def.roughness,
    metalness: tex ? 0 : def.metalness,
  });
  if (tex) m.map = getTexture(tex);
  if (key === 'led') {
    m.emissive.set(color ?? def.color);
    m.emissiveIntensity = 2;
  }
  materials.set(id, m);
  return m;
}
