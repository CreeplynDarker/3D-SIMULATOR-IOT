import { useMemo } from 'react';
import type { MeshStandardMaterial } from 'three';
import { USB_CABLE, WIRE_COLORS } from '../../shared/wiring.ts';
import { getMaterial } from '../models/materials.ts';
import { benchRoutes, usbRoute } from './route.ts';
import { Wire } from './Wire.tsx';

const USB_RADIUS_m = 0.0018;

/** Each wire's own material, by wire id; the signal-flow view (P6.2) sets glow and dimming on it. */
export const wireMaterials = new Map<string, MeshStandardMaterial>();

/** W01–W29 (§13.3) plus the USB cable to the laptop. */
export function Wires() {
  const routes = useMemo(benchRoutes, []);
  const usb = useMemo(usbRoute, []);
  const wires = useMemo(
    () =>
      routes.map((r) => {
        const material = (getMaterial('paint', WIRE_COLORS[r.color]) as MeshStandardMaterial).clone();
        wireMaterials.set(r.id, material);
        return { r, material };
      }),
    [routes],
  );
  return (
    <group name="wires">
      {wires.map(({ r, material }) => (
        <Wire key={r.id} name={r.id} points_m={r.points_m} color={WIRE_COLORS[r.color]} material={material} />
      ))}
      <Wire name="usb" points_m={usb} color={WIRE_COLORS[USB_CABLE.color]} radius_m={USB_RADIUS_m} />
    </group>
  );
}
