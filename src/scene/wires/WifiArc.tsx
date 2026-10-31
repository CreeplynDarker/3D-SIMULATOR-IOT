import { QuadraticBezierLine } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { type ComponentRef, useMemo, useRef } from 'react';
import { Color, type Sprite } from 'three';
import type { Vec3 } from '../../shared/components.ts';
import { WIFI_LINK } from '../../shared/wiring.ts';
import { appStore } from '../../store/index.ts';
import { bezier, fade, pulseU, travel_s } from '../anim.ts';
import { animDebug } from '../animDebug.ts';
import { displayTime } from '../time.ts';
import { worldAnchor_m } from '../anchors.ts';
import { getGlowMaterial } from '../models/materials.ts';

const ARC_RISE_m = 0.14; // how far the arc's control point sits above the higher end
const COLOR = { idle: new Color('#38bdf8'), drop: new Color('#ef4444') };
/** A packet or verdict crosses the arc in this much wall time (scaled by the sim speed, capped under half a window). */
const TRAVEL = { wall_s: 0.35, cap_s: 0.45 };
/** A dropped packet turns the arc red, fading over this much wall time (capped under one window). */
const DROP_FLASH = { wall_s: 0.8, cap_s: 0.9 };
const PULSE_m = 0.007;

/**
 * Dashed "Wi-Fi" arc from the ESP32 antenna to the top of the laptop screen. With `tgl-flow` on, each packet sent
 * runs up it and each verdict delivered runs down after the packet arrives; a dropped packet flashes it red (P6.2).
 */
export function WifiArc() {
  const [start, mid, end] = useMemo((): [Vec3, Vec3, Vec3] => {
    const a = worldAnchor_m(WIFI_LINK.from);
    const b = worldAnchor_m(WIFI_LINK.to);
    const top = Math.max(a[1], b[1]) + ARC_RISE_m;
    return [a, [(a[0] + b[0]) / 2, top, (a[2] + b[2]) / 2], b];
  }, []);
  const line = useRef<ComponentRef<typeof QuadraticBezierLine>>(null);
  const up = useRef<Sprite>(null);
  const down = useRef<Sprite>(null);
  const upMat = useMemo(() => getGlowMaterial('#7dd3fc'), []);
  const downMat = useMemo(() => getGlowMaterial('#86efac'), []);
  const color = useMemo(() => new Color(), []);

  useFrame(() => {
    const s = appStore.getState();
    const snap = s.sim.snapshot;
    const tr = snap?.traffic;
    const on = s.ui.toggles.flow && tr !== undefined;
    const t_s = displayTime(s);
    const travel = travel_s(s.sim.speed, TRAVEL.wall_s, TRAVEL.cap_s);
    const uUp = on ? pulseU(t_s, tr.lastPacket_s, travel) : null;
    // The verdict leaves the laptop when its packet has arrived, then takes the same time back down.
    const uDown = on ? pulseU(t_s, tr.lastVerdict_s + travel, travel) : null;
    const flash = on ? fade(t_s, tr.lastDrop_s, travel_s(s.sim.speed, DROP_FLASH.wall_s, DROP_FLASH.cap_s)) : 0;
    for (const [sprite, u] of [
      [up.current, uUp],
      [down.current, uDown === null ? null : 1 - uDown],
    ] as const) {
      if (!sprite) continue;
      sprite.visible = u !== null;
      if (u !== null) sprite.position.set(...bezier(start, mid, end, u));
    }
    line.current?.material.color.copy(color.copy(COLOR.idle).lerp(COLOR.drop, flash));
    Object.assign(animDebug.wifi, { up: uUp, down: uDown, flash, packets: tr?.packets ?? 0, verdicts: tr?.verdicts ?? 0, dropped: tr?.dropped ?? 0 }); // prettier-ignore
  });

  return (
    <>
      <QuadraticBezierLine
        ref={line}
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
      <sprite ref={up} material={upMat} scale={[PULSE_m, PULSE_m, 1]} visible={false} />
      <sprite ref={down} material={downMat} scale={[PULSE_m, PULSE_m, 1]} visible={false} />
    </>
  );
}
