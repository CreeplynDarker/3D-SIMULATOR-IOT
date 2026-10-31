// P6.1: blades turn by the plant's theta_rad and crossfade to a blur disc above bladeBlurRpm; the frame jitters with
// the last window's a_RMS at vibVisual_Hz (slowed for visibility); airflow streaks leave the outlet with the speed.
// Everything is read from the store inside useFrame and depends on sim time only. Moving parts cast no shadow, so
// the frozen shadow map stays valid (D-057).
import { useFrame } from '@react-three/fiber';
import { type ReactNode, useLayoutEffect, useMemo, useRef } from 'react';
import { DoubleSide, type Group, type Material, type Mesh, MeshBasicMaterial, type Sprite } from 'three';
import { CONFIG } from '../../shared/config.ts';
import { appStore, useAppStore } from '../../store/index.ts';
import { airflowPhase, bladeMix, jitterAmplitude_mm, jitterOffset_mm } from '../anim.ts';
import { animDebug } from '../animDebug.ts';
import { getGlowMaterial } from './materials.ts';

const MM = 0.001;
const DISC = { inner_mm: 14.2, outer_mm: 33, z_mm: 0.8, color: '#3a3a40', maxOpacity: 0.85 };
const AIR = { streaks: 10, z0_mm: 9, z1_mm: 90, rMin_mm: 18, rMax_mm: 30, size_mm: 5, color: '#9fd8ff' };

/** Gives every mesh under `group` its own transparent copy of its material, and stops it casting shadows. */
function ownTransparent(group: Group): Material[] {
  const out: Material[] = [];
  group.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const m = (mesh.material as Material).clone();
    m.transparent = true;
    mesh.material = m;
    mesh.castShadow = false;
    out.push(m);
  });
  return out;
}

/** Airflow streaks in the fan frame (+z = outlet). */
function Airflow() {
  const refs = useRef<(Sprite | null)[]>([]);
  const on = useAppStore((s) => s.ui.toggles.airflow);
  const mat = useMemo(() => getGlowMaterial(AIR.color), []);
  const seeds = useMemo(
    () => Array.from({ length: AIR.streaks }, (_, k) => {
      const a = (k * 2.399963) % (Math.PI * 2); // golden-angle spread around the hub
      const r = AIR.rMin_mm + ((k * 7) % AIR.streaks) / AIR.streaks * (AIR.rMax_mm - AIR.rMin_mm);
      return [r * Math.cos(a), r * Math.sin(a)] as const;
    }),
    [],
  ); // prettier-ignore
  useFrame(() => {
    const snap = appStore.getState().sim.snapshot;
    const rpm = snap?.rpm ?? 0;
    const visible = on && rpm > 1;
    animDebug.fan.airflowVisible = visible;
    refs.current.forEach((s, k) => {
      if (!s) return;
      s.visible = visible;
      if (!visible) return;
      const u = airflowPhase(snap?.t_s ?? 0, k, CONFIG.fan.rpmRated, rpm, AIR.streaks);
      const [x, y] = seeds[k] as readonly [number, number];
      s.position.set(x * MM, y * MM, (AIR.z0_mm + u * (AIR.z1_mm - AIR.z0_mm)) * MM);
      s.material.opacity = Math.sin(Math.PI * u) * Math.min(1, rpm / CONFIG.fan.rpmRated);
    });
  });
  return (
    <>
      {seeds.map(
        (_, k) =>
        <sprite key={k} ref={(el) => void (refs.current[k] = el)} scale={[AIR.size_mm * MM, AIR.size_mm * MM, 1]} material={mat.clone()} visible={false} />, // prettier-ignore
      )}
    </>
  );
}

/** Wraps the fan model: jitter on the outer group, blade rotation and blur disc inside. */
export function FanMotion({ children }: { children: ReactNode }) {
  const outer = useRef<Group>(null);
  const disc = useRef<Mesh>(null);
  const blades = useRef<{ group: Group; mats: Material[] } | null>(null);
  const discMat = useMemo(() => new MeshBasicMaterial({ color: DISC.color, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }), []); // prettier-ignore

  useLayoutEffect(() => {
    const g = outer.current?.getObjectByName('blades') as Group | undefined;
    if (g) blades.current = { group: g, mats: ownTransparent(g) };
  }, []);

  useFrame(() => {
    const s = appStore.getState();
    const snap = s.sim.snapshot;
    const mix = bladeMix(snap?.rpm ?? 0, CONFIG.ui.bladeBlurRpm);
    const b = blades.current;
    if (b) {
      b.group.rotation.z = snap?.theta_rad ?? 0;
      for (const m of b.mats) m.opacity = 1 - mix;
      b.group.visible = mix < 1;
    }
    discMat.opacity = mix * DISC.maxOpacity;
    if (disc.current) disc.current.visible = mix > 0;
    const a_rms_g = snap && snap.state !== 'OFF' ? (s.series.windows.last()?.a_rms_g ?? 0) : 0;
    const amp_mm = snap && snap.rpm > 1 ? jitterAmplitude_mm(a_rms_g, s.ui.vibExaggeration, CONFIG.ui) : 0;
    const [x, y] = jitterOffset_mm(amp_mm, snap?.t_s ?? 0, CONFIG.ui.vibVisual_Hz);
    outer.current?.position.set(x * MM, y * MM, 0);
    Object.assign(animDebug.fan, { bladeAngle_rad: snap?.theta_rad ?? 0, bladeOpacity: 1 - mix, discOpacity: mix, jitterAmp_mm: amp_mm, jitter_mm: [x, y] }); // prettier-ignore
  });

  return (
    <group ref={outer} name="fan-jitter">
      {children}
      <mesh ref={disc} position={[0, 0, DISC.z_mm * MM]} material={discMat} visible={false}>
        <ringGeometry args={[DISC.inner_mm * MM, DISC.outer_mm * MM, 48]} />
      </mesh>
      <Airflow />
    </group>
  );
}
