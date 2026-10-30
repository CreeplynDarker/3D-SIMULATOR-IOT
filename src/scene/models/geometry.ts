// Part lists for every bench model (spec §13.2), in mm around each bounding-box centre.
// Pin positions come from scene/anchors.ts so wires land exactly on the modelled pins.
import type { ComponentId } from '../../shared/components.ts';
import { ACS_DIMS, ESP32_DIMS, ESP32_LEFT_PINS, esp32PinX_mm, MPU_DIMS, MPU_PINS, RELAY_DIMS } from '../anchors.ts';
import { box, cyl, type Part } from './parts.ts';

const TAU = Math.PI * 2;

/** Fan: square frame with a Ø66.4 mm opening, hub with the photo label, 4 struts on the outlet (+z) side, 7 blades. */
export function fanParts(): Part[] {
  const parts: Part[] = [
    { kind: 'frame', outer: 70, holeR: 33.2, depth: 15, mountR: 2.2, mountInset: 4.5, pos: [0, 0, 0], mat: 'fanBlack' },
    cyl(14, 13, 'z', [0, 0, 0], 'fanBlack', { seg: 40 }),
    { kind: 'disc', r: 13.6, pos: [0, 0, 6.55], mat: 'label', tex: 'fan-hub' },
  ];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    parts.push(box([20.5, 2.6, 3], [24 * Math.cos(a), 24 * Math.sin(a), 5.5], 'fanBlack', { rot: [0, 0, a] }));
  }
  for (let i = 0; i < 7; i++) {
    const a = (i * TAU) / 7;
    const r = 23.6;
    parts.push(
      box([17.5, 13, 1.2], [r * Math.cos(a), r * Math.sin(a), 0], 'fanBlack', {
        rot: [0.6, 0, a],
        order: 'ZYX',
        group: 'blades',
        name: `blade:${i}`,
      }),
    );
  }
  return parts;
}

/** GY-521: blue board, the MPU6050 chip, 8 gold header holes on the +z edge, power LED. */
export function mpuParts(): Part[] {
  const parts: Part[] = [
    box([21, 1, 16], [0, -0.3, 0], 'pcbBlue'),
    box([4, 0.6, 4], [0, 0.5, -1.5], 'chip'),
    box([1.6, 0.5, 0.8], [-6, 0.45, -4], 'paint', { color: '#8a6a4a' }),
    box([1.6, 0.5, 0.8], [6, 0.45, -4], 'paint', { color: '#8a6a4a' }),
    box([1, 0.4, 0.6], [7.5, 0.4, -6], 'led', { color: '#39ff6a', group: 'leds' }),
  ];
  MPU_PINS.forEach((name, i) => {
    const x = (i - (MPU_PINS.length - 1) / 2) * MPU_DIMS.pitch;
    parts.push(cyl(0.75, 1.02, 'y', [x, -0.29, MPU_DIMS.rowZ], 'gold', { name: `hole:${name}` }));
  });
  return parts;
}

/** DS18B20: Ø6 steel tube, black seal where the cable enters (+x), a band of tape holding it to the hub. */
export function ds18b20Parts(): Part[] {
  return [
    cyl(3, 44, 'x', [-3, 0, 0], 'steel', { seg: 24 }),
    cyl(3, 6, 'x', [22, 0, 0], 'paint', { color: '#151515', seg: 24 }),
    cyl(3.08, 8, 'x', [-5, 0, 0], 'tape', { seg: 24 }),
  ];
}

/** ESP32 DevKit V1: 30 pins below black headers, photo-textured PCB, shield can, antenna, USB-C, buttons. */
export function esp32Parts(): Part[] {
  const { rowHalf } = ESP32_DIMS;
  const parts: Part[] = [
    box([38.1, 2.5, 2.54], [0, 1.25, -rowHalf], 'plasticBlack'),
    box([38.1, 2.5, 2.54], [0, 1.25, rowHalf], 'plasticBlack'),
    box([52, 1.6, 28], [0, 3.3, 0], 'pcbBlack', { tex: 'esp32-pcb' }),
    box([18.4, 2.4, 16.2], [10.7, 5.3, 0], 'metal', { tex: 'esp32-shield' }),
    box([6, 0.8, 18], [22.9, 4.5, 0], 'pcbBlack'),
    box([7, 2.4, 9], [-22.5, 5.3, 0], 'metal'),
    box([3.5, 1.2, 3], [-20.5, 4.7, -9.5], 'paint', { color: '#d9d9d9' }),
    box([3.5, 1.2, 3], [-20.5, 4.7, 9.5], 'paint', { color: '#d9d9d9' }),
    box([1.2, 0.5, 0.8], [-8, 4.35, 7], 'led', { color: '#ff2a2a', group: 'leds' }),
  ];
  for (let k = 0; k < ESP32_LEFT_PINS.length; k++) {
    for (const z of [-rowHalf, rowHalf]) {
      const x = esp32PinX_mm(k);
      parts.push(box([0.64, 6.5, 0.64], [x, -3.25, z], 'metal', { name: `pin:${k}:${z < 0 ? 'L' : 'R'}` }));
      parts.push(cyl(0.7, 0.5, 'y', [x, 4.35, z], 'solder', { seg: 10 }));
    }
  }
  return parts;
}

/** 830-point breadboard: one white block; the holes, rails and labels are a drawn texture. */
export function breadboardParts(): Part[] {
  return [box([165, 9.5, 55], [0, 0, 0], 'plasticWhite', { tex: 'breadboard' })];
}

/** Resistor colour bands (4-band code). */
export const RESISTOR_BANDS = {
  r_pu_ds: ['#f5d000', '#7b2fbe', '#c62828', '#c9a227'], // 4.7 kΩ: yellow violet red gold
  r_pu_tach: ['#6d4c41', '#151515', '#ef6c00', '#c9a227'], // 10 kΩ: brown black orange gold
  r_div_top: ['#6d4c41', '#151515', '#ef6c00', '#c9a227'], // 10 kΩ
  r_div_bot: ['#c62828', '#151515', '#ef6c00', '#c9a227'], // 20 kΩ: red black orange gold
} as const;

/** Axial resistor body along x with four colour bands. */
export function resistorParts(bands: readonly string[]): Part[] {
  const parts: Part[] = [
    cyl(1.1, 4.6, 'x', [0, 0, 0], 'resistorBody', { seg: 16 }),
    cyl(1.15, 0.7, 'x', [-2.65, 0, 0], 'resistorBody', { seg: 16 }),
    cyl(1.15, 0.7, 'x', [2.65, 0, 0], 'resistorBody', { seg: 16 }),
  ];
  [-1.6, -0.8, 0, 1.7].forEach((x, i) =>
    parts.push(cyl(1.16, 0.45, 'x', [x, 0, 0], 'paint', { color: bands[i] ?? '#000', seg: 16 })),
  );
  return parts;
}

/** ACS712 module: photo-textured blue PCB, 2-screw terminal at −x, SOIC-8 chip, right-angle header at +x. */
export function acs712Parts(): Part[] {
  const { pinY, pinPitch } = ACS_DIMS;
  const parts: Part[] = [
    box([31, 1.6, 13], [0, -5.2, 0], 'pcbBlue', { tex: 'acs712-pcb' }),
    box([10.3, 10.4, 13], [-10.35, 0.8, 0], 'terminalBlue'),
    box([5, 1.6, 4], [-0.5, -3.6, 0], 'chip'),
    box([2.5, 2.5, 7.6], [9.75, pinY, 0], 'plasticBlack'),
  ];
  for (const z of [-pinPitch, pinPitch]) {
    parts.push(cyl(1.9, 0.4, 'y', [-10.6, 5.6, z], 'metal'));
    parts.push(box([0.3, 3, 3.2], [-15.35, -1, z], 'hole'));
  }
  for (const z of [-pinPitch, 0, pinPitch]) parts.push(box([4.5, 0.64, 0.64], [13.25, pinY, z], 'metal'));
  return parts;
}

/** Relay module: black PCB (photo), two blue relays (CH1 X-marked), two 3-way terminal blocks, opto, LEDs, headers. */
export function relayParts(): Part[] {
  const { terminalX, terminalY, headerA, headerB, headerPinY, halfDepth } = RELAY_DIMS;
  const parts: Part[] = [
    box([50, 1.6, 38], [0, -8.7, 0], 'pcbBlack', { tex: 'relay-pcb' }),
    box([15.5, 17.4, 19], [-12.5, 0.8, 0.5], 'relayBlue', { tex: 'relay-ch1', name: 'relay:ch1' }),
    box([15.5, 17.4, 19], [12.5, 0.8, 0.5], 'relayBlue', { tex: 'relay-ch2', name: 'relay:ch2' }),
    box([15, 10, 10], [-12.5, -2.9, -14], 'terminalBlue'),
    box([15, 10, 10], [12.5, -2.9, -14], 'terminalBlue'),
    box([4.5, 3.5, 6.4], [-4.5, -6.15, 13], 'chip'),
    box([4.5, 3.5, 6.4], [4.5, -6.15, 13], 'chip'),
    box([7.6, 2.5, 2.5], [-10.96, headerPinY, 14.75], 'plasticBlack'),
    box([10.2, 2.5, 2.5], [6.31, headerPinY, 14.75], 'plasticBlack'),
    box([1.6, 0.6, 0.8], [20, -7.6, 12], 'led', { color: '#ff2a2a', group: 'led:power' }),
    box([1.6, 0.6, 0.8], [-19, -7.6, 9.8], 'led', { color: '#ff2a2a', group: 'led:ch1' }),
    box([1.6, 0.6, 0.8], [19, -7.6, 9.8], 'led', { color: '#ff2a2a', group: 'led:ch2' }),
  ];
  for (const x of Object.values(terminalX)) {
    parts.push(cyl(1.8, 0.4, 'y', [x, 1.9, -13.5], 'metal'));
    parts.push(box([3.2, 3.2, 0.3], [x, terminalY, -halfDepth + 0.15], 'hole'));
  }
  for (const x of Object.values({ ...headerA, ...headerB })) {
    parts.push(box([0.64, 0.64, 3], [x, headerPinY, halfDepth - 1.5], 'metal'));
  }
  return parts;
}

/** Female barrel jack on a black body (socket at −x) with a green 2-screw terminal at +x. */
export function dcjackParts(): Part[] {
  return [
    box([16, 11, 15], [-4.5, -0.5, 0], 'plasticBlack'),
    cyl(3.2, 0.4, 'x', [-12.35, -1.5, 0], 'hole', { seg: 24 }),
    cyl(1, 0.5, 'x', [-12.3, -1.5, 0], 'metal'),
    box([9, 12, 15], [8, 0, 0], 'terminalGreen'),
    cyl(1.8, 0.4, 'y', [8, 5.8, -2.5], 'metal'),
    cyl(1.8, 0.4, 'y', [8, 5.8, 2.5], 'metal'),
    box([0.3, 3, 3.2], [12.35, 0, -2.5], 'hole'),
    box([0.3, 3, 3.2], [12.35, 0, 2.5], 'hole'),
  ];
}

/** Wall adapter lying flat: black body with the photo label on top, cable strain relief at +x. */
export function adapterParts(): Part[] {
  return [
    box([75, 29.8, 45], [0, -0.1, 0], 'plasticBlack'),
    box([55, 0.2, 41], [-5, 14.9, 0], 'label', { tex: 'adapter-label' }),
    cyl(3.5, 5, 'x', [35, -5, 0], 'paint', { color: '#151515' }),
  ];
}

const LID_TILT_rad = (-3 * Math.PI) / 180;

/** Point on the laptop lid (mm, relative to the hinge before tilting) in the laptop frame. */
function lidPoint(y: number, z: number): [number, number, number] {
  const c = Math.cos(LID_TILT_rad);
  const s = Math.sin(LID_TILT_rad);
  return [0, -95 + y * c - z * s, -90 + y * s + z * c];
}

/** Open laptop: base with keyboard and trackpad, lid tilted back 3°, screen showing the mini dashboard. */
export function laptopParts(): Part[] {
  const tilt = { rot: [LID_TILT_rad, 0, 0] as const };
  return [
    box([320, 15, 200], [0, -102.5, 10], 'laptopBody'),
    box([290, 0.4, 100], [0, -95, -20], 'laptopKeys'),
    box([100, 0.4, 60], [0, -95, 65], 'paint', { color: '#2b2e33' }),
    box([0.5, 3, 9], [-159.8, -102.5, 40], 'hole'),
    cyl(4, 300, 'x', [0, -95, -90], 'laptopBody'),
    box([320, 205, 6], lidPoint(102.5, -3), 'laptopBody', tilt),
    box([300, 185, 0.3], lidPoint(106, 0.15), 'label', { ...tilt, tex: 'screen', texFace: 'pz' }),
  ];
}

/** Part list of each component, keyed by its §13.2 id. */
export const MODEL_PARTS: Record<ComponentId, () => Part[]> = {
  fan: fanParts,
  mpu6050: mpuParts,
  ds18b20: ds18b20Parts,
  breadboard: breadboardParts,
  esp32: esp32Parts,
  r_pu_ds: () => resistorParts(RESISTOR_BANDS.r_pu_ds),
  r_pu_tach: () => resistorParts(RESISTOR_BANDS.r_pu_tach),
  r_div_top: () => resistorParts(RESISTOR_BANDS.r_div_top),
  r_div_bot: () => resistorParts(RESISTOR_BANDS.r_div_bot),
  acs712: acs712Parts,
  relay: relayParts,
  dcjack: dcjackParts,
  adapter: adapterParts,
  laptop: laptopParts,
};
