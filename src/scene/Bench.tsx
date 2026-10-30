import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { type ReactNode, useEffect, useRef } from 'react';
import { type ComponentId, COMPONENTS, componentById } from '../shared/components.ts';
import { Acs712 } from './models/Acs712.tsx';
import { Adapter } from './models/Adapter.tsx';
import { Breadboard } from './models/Breadboard.tsx';
import { DcJack } from './models/DcJack.tsx';
import { Ds18b20 } from './models/Ds18b20.tsx';
import { Esp32 } from './models/Esp32.tsx';
import { Fan, FanStand } from './models/Fan.tsx';
import { Laptop } from './models/Laptop.tsx';
import { photoTexturesReady } from './models/materials.ts';
import { Mpu6050 } from './models/Mpu6050.tsx';
import { Relay } from './models/Relay.tsx';
import { Resistor } from './models/Resistor.tsx';

/** Scene hooks for the e2e tests (`window.__scene`, only with `?debug=1`). */
export interface SceneDebug {
  frames(): number;
  texturesReady(): boolean;
}

declare global {
  interface Window {
    __scene?: SceneDebug;
  }
}

const MODELS: Record<ComponentId, () => ReactNode> = {
  fan: () => <Fan />,
  mpu6050: () => <Mpu6050 />,
  ds18b20: () => <Ds18b20 />,
  breadboard: () => <Breadboard />,
  esp32: () => <Esp32 />,
  r_pu_ds: () => <Resistor id="r_pu_ds" />,
  r_pu_tach: () => <Resistor id="r_pu_tach" />,
  r_div_top: () => <Resistor id="r_div_top" />,
  r_div_bot: () => <Resistor id="r_div_bot" />,
  acs712: () => <Acs712 />,
  relay: () => <Relay />,
  dcjack: () => <DcJack />,
  adapter: () => <Adapter />,
  laptop: () => <Laptop />,
};

const BENCH = { size_m: [0.9, 0.02, 0.45] as const, center_m: [0.1, -0.01, 0] as const };

/** Places children at a component's §13.2 position and rotation. */
function Placed({ id, children }: { id: ComponentId; children: ReactNode }) {
  const c = componentById(id);
  return (
    <group name={id} position={[...c.position_m]} rotation={[0, (c.rotY_deg * Math.PI) / 180, 0]}>
      {children}
    </group>
  );
}

/** The bench top and every §13.2 component at its position. */
export function Bench() {
  return (
    <>
      <mesh position={[...BENCH.center_m]} receiveShadow>
        <boxGeometry args={[...BENCH.size_m]} />
        <meshStandardMaterial color="#8f8f8b" roughness={0.9} />
      </mesh>
      {COMPONENTS.map((c) => (
        <Placed key={c.id} id={c.id}>
          {MODELS[c.id]()}
        </Placed>
      ))}
      <Placed id="fan">
        <FanStand />
      </Placed>
    </>
  );
}

/** Counts rendered frames and exposes `window.__scene` with `?debug=1`. */
function DebugProbe() {
  const frames = useRef(0);
  useFrame(() => {
    frames.current++;
  });
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
    window.__scene = { frames: () => frames.current, texturesReady: photoTexturesReady };
    return () => {
      delete window.__scene;
    };
  }, []);
  return null;
}

/** M1 viewport: the 3D bench in a full-size canvas. */
export function BenchViewport() {
  return (
    <div data-testid="viewport" className="relative h-full w-full">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0.1, 0.55, 0.75], fov: 40, near: 0.005, far: 20 }}>
        <color attach="background" args={['#101216']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[0.4, 1.2, 0.6]} intensity={2.2} castShadow />
        <Bench />
        <OrbitControls makeDefault target={[0.05, 0.02, 0]} />
        <DebugProbe />
      </Canvas>
    </div>
  );
}
