import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/index.ts';
import type { Theme } from '../store/slices/ui.ts';

/** Scene colours and light levels per UI theme (spec §8.1: light and dark themes). */
export const SCENE_THEMES: Record<Theme, { background: string; bench: string; ambient: number; env: number }> = {
  dark: { background: '#101216', bench: '#8c8c88', ambient: 0.25, env: 0.55 },
  light: { background: '#e8edf3', bench: '#b8b8b3', ambient: 0.45, env: 0.85 },
};

// Shadow camera bounds cover the 0.90 × 0.45 m bench (§13.1) with a little margin.
const SHADOW_HALF_m = 0.5;
// Frames over which the shadow map is drawn after mount, so late-mounted parts are included.
const SHADOW_WARMUP_FRAMES = 3;

/**
 * Lighting, reflections and contact shadows. The environment is built from Lightformers in the scene, so nothing
 * is fetched at run time (AGENTS.md rule 11).
 */
export function Look() {
  const theme = SCENE_THEMES[useAppStore((s) => s.ui.theme)];
  return (
    <>
      <color attach="background" args={[theme.background]} />
      <ambientLight intensity={theme.ambient} />
      <directionalLight
        position={[0.35, 0.9, 0.55]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-SHADOW_HALF_m}
        shadow-camera-right={SHADOW_HALF_m}
        shadow-camera-top={SHADOW_HALF_m}
        shadow-camera-bottom={-SHADOW_HALF_m}
        shadow-camera-near={0.1}
        shadow-camera-far={2.5}
      />
      <directionalLight position={[-0.6, 0.5, -0.4]} intensity={0.6} />
      <Environment resolution={256} environmentIntensity={theme.env}>
        <Lightformer form="rect" intensity={3} position={[0, 2, 0]} rotation-x={Math.PI / 2} scale={[3, 3, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[2, 0.6, 1]} rotation-y={-Math.PI / 3} scale={[2, 1, 1]} />
        <Lightformer form="rect" intensity={1} position={[-2, 0.6, -1]} rotation-y={Math.PI / 3} scale={[2, 1, 1]} />
        <Lightformer form="ring" color="#9ecbff" intensity={0.8} position={[0, 0.4, 2]} scale={1.5} />
      </Environment>
      <ContactShadows position={[0.1, 0.0004, 0]} scale={[0.95, 0.5]} far={0.12} blur={2.2} opacity={0.55} frames={1} />
      <StaticShadows />
    </>
  );
}

/**
 * The bench is static, so the shadow map is drawn for the first few frames and then frozen. Anything that moves a
 * shadow-casting part later (P6) must set `gl.shadowMap.needsUpdate = true`.
 */
function StaticShadows() {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useFrame(() => {
    if (frames.current >= SHADOW_WARMUP_FRAMES) return;
    frames.current++;
    gl.shadowMap.needsUpdate = true;
  });
  return null;
}
