import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Group, Object3D } from 'three';
import { appStore } from '../../store/index.ts';
import { playClick } from '../../ui/audio.ts';
import { RELAY_DIMS } from '../anchors.ts';
import { animDebug } from '../animDebug.ts';
import { relayParts } from './geometry.ts';
import { getMaterial } from './materials.ts';
import { Parts } from './Parts.tsx';

// CH2 contact arm (mm, relay frame): it pivots above COM2 and points at NC2 (contact NC) or NO2 (contact NO).
const ARM = { y: 3.4, z: -13.5, length: 5, width: 1.2, thick: 0.6 };
const POINT_AT = { NC: Math.PI, NO: 0 } as const;

/**
 * 2-channel relay module (only CH2 is wired). P6.3: the CH2 arm follows the plant's contact, the CH2 LED is lit
 * while its coil is energised, and each contact change clicks when sound is on. The arm casts no shadow (D-059).
 */
export function Relay() {
  const parts = useMemo(relayParts, []);
  const root = useRef<Group>(null);
  const arm = useRef<Group>(null);
  const leds = useRef<{ ch1: Object3D | undefined; ch2: Object3D | undefined }>({ ch1: undefined, ch2: undefined });
  const last = useRef<'NC' | 'NO' | null>(null);

  useLayoutEffect(() => {
    leds.current = { ch1: root.current?.getObjectByName('led:ch1'), ch2: root.current?.getObjectByName('led:ch2') };
    if (leds.current.ch1) leds.current.ch1.visible = false; // CH1 is dead and IN1 unconnected (§1.2)
  }, []);

  useFrame(() => {
    const s = appStore.getState();
    const snap = s.sim.snapshot;
    const contact = snap?.contact ?? 'NC';
    const coil = snap?.coilOn ?? false;
    if (arm.current) arm.current.rotation.y = POINT_AT[contact];
    if (leds.current.ch2) leds.current.ch2.visible = coil;
    const r = animDebug.relay;
    if (last.current !== null && last.current !== contact) {
      r.changes++;
      if (s.ui.soundOn) {
        playClick();
        r.clicks++;
      }
    }
    last.current = contact;
    r.arm = contact;
    r.led = coil;
  });

  return (
    <group ref={root}>
      <Parts parts={parts} />
      <group scale={0.001}>
        <group ref={arm} name="relay:arm" position={[RELAY_DIMS.terminalX.com2, ARM.y, ARM.z]}>
          <mesh position={[ARM.length / 2, 0, 0]} material={getMaterial('gold')}>
            <boxGeometry args={[ARM.length, ARM.thick, ARM.width]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
