// P6.1 and P6.4: blades turn by the plant's theta_rad and crossfade to a blur disc above bladeBlurRpm; the frame jitters with
// the last window's a_RMS at vibVisual_Hz (slowed for visibility); airflow streaks leave the outlet with the speed.
// With tgl-heat the hub is tinted by the motor temperature, and with sound on the hum follows rpm and a_RMS.
// Everything is read from the store inside useFrame and depends on sim time only. Moving parts cast no shadow, so
// the frozen shadow map stays valid (D-057).
import { useFrame } from '@react-three/fiber';
import { type ReactNode, useLayoutEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  type Group,
  type Material,
  type Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  type Points,
  PointsMaterial,
} from 'three';
import { CONFIG } from '../../shared/config.ts';
import { appStore, useAppStore } from '../../store/index.ts';
import { humFor, setHum } from '../../ui/audio.ts';
import { airflowPhase, bladeMix, heatColor, jitterAmplitude_mm, jitterOffset_mm } from '../anim.ts';
import { animDebug } from '../animDebug.ts';
import { POINT_SIZE_PER_SPRITE } from '../cameras.ts';
import { getGlowMaterial } from './materials.ts';

const MM = 0.001;
const DISC = { inner_mm: 14.2, outer_mm: 33, z_mm: 0.8, color: '#3a3a40', maxOpacity: 0.85 };
const GOLDEN_ANGLE_rad = 2.399963;
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

/** Airflow streaks in the fan frame (+z = outlet), as one Points object: one draw call (P7.2). */
function Airflow() {
  const points = useRef<Points>(null);
  const on = useAppStore((s) => s.ui.toggles.airflow);
  const { seeds, positions, colors, material } = useMemo(() => {
    const seeds = Array.from({ length: AIR.streaks }, (_, k) => {
      const a = (k * GOLDEN_ANGLE_rad) % (Math.PI * 2); // spread around the hub
      const r = AIR.rMin_mm + (((k * 7) % AIR.streaks) / AIR.streaks) * (AIR.rMax_mm - AIR.rMin_mm);
      return [r * Math.cos(a), r * Math.sin(a)] as const;
    });
    const material = new PointsMaterial({
      size: AIR.size_mm * MM * POINT_SIZE_PER_SPRITE,
      map: getGlowMaterial(AIR.color).map,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    return { seeds, positions: new Float32Array(AIR.streaks * 3), colors: new Float32Array(AIR.streaks * 3), material };
  }, []);
  const base = useMemo(() => new Color(AIR.color), []);
  useFrame(() => {
    const snap = appStore.getState().sim.snapshot;
    const rpm = snap?.rpm ?? 0;
    const visible = on && rpm > 1;
    animDebug.fan.airflowVisible = visible;
    const p = points.current;
    if (!p) return;
    p.visible = visible;
    if (!visible) return;
    seeds.forEach(([x, y], k) => {
      const u = airflowPhase(snap?.t_s ?? 0, k, CONFIG.fan.rpmRated, rpm, AIR.streaks);
      positions.set([x * MM, y * MM, (AIR.z0_mm + u * (AIR.z1_mm - AIR.z0_mm)) * MM], k * 3);
      // additive blending: a darker colour is a fainter streak
      const fade = Math.sin(Math.PI * u) * Math.min(1, rpm / CONFIG.fan.rpmRated);
      colors.set([base.r * fade, base.g * fade, base.b * fade], k * 3);
    });
    p.geometry.getAttribute('position').needsUpdate = true;
    p.geometry.getAttribute('color').needsUpdate = true;
  });
  return (
    <points ref={points} material={material} frustumCulled={false} visible={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
    </points>
  );
}

/** Wraps the fan model: jitter on the outer group, blade rotation and blur disc inside. */
export function FanMotion({ children }: { children: ReactNode }) {
  const outer = useRef<Group>(null);
  const disc = useRef<Mesh>(null);
  const blades = useRef<{ group: Group; mats: Material[] } | null>(null);
  const hub = useRef<MeshStandardMaterial | null>(null);
  const discMat = useMemo(() => new MeshBasicMaterial({ color: DISC.color, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }), []); // prettier-ignore

  useLayoutEffect(() => {
    const g = outer.current?.getObjectByName('blades') as Group | undefined;
    if (g) blades.current = { group: g, mats: ownTransparent(g) };
    // The hub label gets its own material, so the heat tint (P6.4) touches nothing else.
    const hubMesh = outer.current?.getObjectByName('hub')?.children[0] as Mesh | undefined;
    if (hubMesh) {
      hub.current = (hubMesh.material as MeshStandardMaterial).clone();
      hubMesh.material = hub.current;
    }
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
    const hubColor = s.ui.toggles.heat && snap ? heatColor(snap.tMotor_C) : '#ffffff';
    if (hub.current && animDebug.fan.hubColor !== hubColor) hub.current.color.set(hubColor);
    animDebug.fan.hubColor = hubColor;
    const sound = s.ui.soundOn ? humFor(snap?.rpm ?? 0, a_rms_g, s.sim.playing) : { freq_Hz: 0, gain: 0 };
    if (s.ui.soundOn) setHum(sound.freq_Hz, sound.gain);
    Object.assign(animDebug.sound, { on: s.ui.soundOn, ...sound });
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
