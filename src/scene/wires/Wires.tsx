import { useMemo } from 'react';
import { USB_CABLE, WIRE_COLORS } from '../../shared/wiring.ts';
import { routeWires, usbRoute } from './route.ts';
import { Wire } from './Wire.tsx';

const USB_RADIUS_m = 0.0018;

/** W01–W29 (§13.3) plus the USB cable to the laptop. */
export function Wires() {
  const routes = useMemo(routeWires, []);
  const usb = useMemo(usbRoute, []);
  return (
    <group name="wires">
      {routes.map((r) => (
        <Wire key={r.id} name={r.id} points_m={r.points_m} color={WIRE_COLORS[r.color]} />
      ))}
      <Wire name="usb" points_m={usb} color={WIRE_COLORS[USB_CABLE.color]} radius_m={USB_RADIUS_m} />
    </group>
  );
}
