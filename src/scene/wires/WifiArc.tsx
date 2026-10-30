import { QuadraticBezierLine } from '@react-three/drei';
import { useMemo } from 'react';
import type { Vec3 } from '../../shared/components.ts';
import { WIFI_LINK } from '../../shared/wiring.ts';
import { worldAnchor_m } from '../anchors.ts';

const ARC_RISE_m = 0.14; // how far the arc's control point sits above the higher end

/** Dashed "Wi-Fi" arc from the ESP32 antenna to the top of the laptop screen. */
export function WifiArc() {
  const [start, mid, end] = useMemo((): [Vec3, Vec3, Vec3] => {
    const a = worldAnchor_m(WIFI_LINK.from);
    const b = worldAnchor_m(WIFI_LINK.to);
    const top = Math.max(a[1], b[1]) + ARC_RISE_m;
    return [a, [(a[0] + b[0]) / 2, top, (a[2] + b[2]) / 2], b];
  }, []);
  return (
    <QuadraticBezierLine
      name="wifi"
      start={[...start]}
      mid={[...mid]}
      end={[...end]}
      color="#38bdf8"
      lineWidth={1.5}
      dashed
      dashSize={0.012}
      gapSize={0.008}
      transparent
      opacity={0.75}
    />
  );
}
