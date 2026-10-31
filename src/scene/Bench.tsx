import { Edges, Html, OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { type ComponentId, COMPONENTS, componentById, type Vec3 } from '../shared/components.ts';
import { appStore, useAppStore } from '../store/index.ts';
import { type AnimDebug, animDebug } from './animDebug.ts';
import { CAMERA_ORDER, CAMERA_PRESETS, CAMERA_TRANSITION_ms, easeInOutCubic } from './cameras.ts';
import { Look, SCENE_THEMES } from './Look.tsx';
import { Acs712 } from './models/Acs712.tsx';
import { Adapter } from './models/Adapter.tsx';
import { Breadboard } from './models/Breadboard.tsx';
import { DcJack } from './models/DcJack.tsx';
import { Ds18b20 } from './models/Ds18b20.tsx';
import { Esp32 } from './models/Esp32.tsx';
import { Fan, FanStand } from './models/Fan.tsx';
import { FanMotion } from './models/FanMotion.tsx';
import { Laptop } from './models/Laptop.tsx';
import { photoTexturesReady } from './models/materials.ts';
import { Mpu6050 } from './models/Mpu6050.tsx';
import { Relay } from './models/Relay.tsx';
import { Resistor } from './models/Resistor.tsx';
import { inspectorFor } from '../ui/inspectorData.ts';
import { Labels } from './Labels.tsx';
import { SignalFlow } from './wires/SignalFlow.tsx';
import { WifiArc } from './wires/WifiArc.tsx';
import { Wires } from './wires/Wires.tsx';

/** Scene hooks for the e2e tests (`window.__scene`, only with `?debug=1`). Screen points are CSS pixels. */
export interface SceneDebug {
  frames(): number;
  texturesReady(): boolean;
  cameraMoving(): boolean;
  cameraPosition(): Vec3;
  project(id: ComponentId): { x: number; y: number } | null;
  selectedId(): string | null;
  setTheme(theme: 'dark' | 'light'): void;
  /** What the animated parts drew in the last frame. */
  anim(): AnimDebug;
}

declare global {
  interface Window {
    __scene?: SceneDebug;
  }
}

const MODELS: Record<ComponentId, () => ReactNode> = {
  fan: () => (
    <FanMotion>
      <Fan />
    </FanMotion>
  ),
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

const toRad = (deg: number) => (deg * Math.PI) / 180;

// Hover/selection highlight: the part's §13.2 box, grown by 2 mm, drawn as edges over a faint fill.
const HIGHLIGHT = { grow_mm: 2, hover: '#ffffff', selected: '#38bdf8', fillOpacity: 0.07 };

/** Box outline around a component (local frame, metres). */
function Highlight({ id, color }: { id: ComponentId; color: string }) {
  const [x, y, z] = componentById(id).size_mm.map((s) => (s + HIGHLIGHT.grow_mm) / 1000) as [number, number, number];
  return (
    <mesh raycast={() => null}>
      <boxGeometry args={[x, y, z]} />
      <meshBasicMaterial color={color} transparent opacity={HIGHLIGHT.fillOpacity} depthWrite={false} />
      <Edges color={color} />
    </mesh>
  );
}

/** M1 hover tooltip: the part's name and its first live pin value (the inspector's text). */
function HoverTip({ id }: { id: ComponentId }) {
  const snap = useAppStore((s) => s.sim.snapshot);
  const status = useAppStore((s) => s.model.status);
  const score = useAppStore((s) => s.model.lastScored?.score ?? null);
  if (!snap) return null;
  const info = inspectorFor(id, snap, { status, score });
  const y_m = componentById(id).size_mm[1] / 2000 + TIP_GAP_m;
  return (
    <Html position={[0, y_m, 0]} center zIndexRange={[20, 0]} wrapperClass="pointer-events-none">
      <div
        data-testid="scene-tooltip"
        className="whitespace-nowrap rounded bg-slate-900/90 px-2 py-1 font-mono text-[11px] text-slate-100 shadow"
      >
        <div className="font-sans font-semibold">{info.name}</div>
        {info.pins[0]?.text}
      </div>
    </Html>
  );
}

const TIP_GAP_m = 0.02;

/** Places a component at its §13.2 pose; hovering highlights it and clicking selects it (`ui.selectedId`). */
function Placed({ id, children }: { id: ComponentId; children: ReactNode }) {
  const c = componentById(id);
  const selected = useAppStore((s) => s.ui.selectedId === id);
  const [hovered, setHovered] = useState(false);
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  };
  const out = () => {
    setHovered(false);
    document.body.style.cursor = 'auto';
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    appStore.getState().ui.select(id);
  };
  return (
    <>
      <group
        name={id}
        position={[...c.position_m]}
        rotation={[0, toRad(c.rotY_deg), 0]}
        onPointerOver={over}
        onPointerOut={out}
        onClick={click}
      >
        {children}
        {(hovered || selected) && <Highlight id={id} color={selected ? HIGHLIGHT.selected : HIGHLIGHT.hover} />}
        {hovered && <HoverTip id={id} />}
      </group>
    </>
  );
}

/** The bench top, every §13.2 component at its position, the wires (§13.3) and the Wi-Fi arc. */
export function Bench() {
  const fan = componentById('fan').position_m;
  const benchColor = SCENE_THEMES[useAppStore((s) => s.ui.theme)].bench;
  return (
    <>
      <mesh position={[...BENCH.center_m]} receiveShadow>
        <boxGeometry args={[...BENCH.size_m]} />
        <meshStandardMaterial color={benchColor} roughness={0.9} />
      </mesh>
      {COMPONENTS.map((c) => (
        <Placed key={c.id} id={c.id}>
          {MODELS[c.id]()}
        </Placed>
      ))}
      <group position={[...fan]}>
        <FanStand />
      </group>
      <Wires />
      <SignalFlow />
      <WifiArc />
      <Labels />
    </>
  );
}

const rig = { moving: false };

interface OrbitLike {
  target: Vector3;
  update(): void;
}
const isOrbit = (c: unknown): c is OrbitLike => typeof c === 'object' && c !== null && 'target' in c;

/** Eases the camera and orbit target to the preset in `ui.camera` over 600 ms. */
function CameraRig() {
  const preset = useAppStore((s) => s.ui.camera);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const move = useRef<{ fromPos: Vector3; fromTarget: Vector3; t0_ms: number } | null>(null);

  useEffect(() => {
    if (!isOrbit(controls)) return;
    move.current = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), t0_ms: performance.now() };
    rig.moving = true;
  }, [preset, camera, controls]);

  useFrame(() => {
    const m = move.current;
    if (!m || !isOrbit(controls)) return;
    const pose = CAMERA_PRESETS[preset];
    const k = easeInOutCubic((performance.now() - m.t0_ms) / CAMERA_TRANSITION_ms);
    camera.position.lerpVectors(m.fromPos, new Vector3(...pose.position_m), k);
    controls.target.lerpVectors(m.fromTarget, new Vector3(...pose.target_m), k);
    controls.update();
    if (k >= 1) {
      move.current = null;
      rig.moving = false;
    }
  });
  return null;
}

/** Counts rendered frames and exposes `window.__scene` with `?debug=1`. */
function DebugProbe() {
  const frames = useRef(0);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useFrame(() => {
    frames.current++;
  });
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
    const project = (id: ComponentId) => {
      const v = new Vector3(...componentById(id).position_m).project(camera);
      if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    window.__scene = {
      frames: () => frames.current,
      texturesReady: photoTexturesReady,
      cameraMoving: () => rig.moving,
      cameraPosition: () => [camera.position.x, camera.position.y, camera.position.z],
      project,
      selectedId: () => appStore.getState().ui.selectedId,
      setTheme: (theme) => appStore.getState().ui.setTheme(theme),
      anim: () => structuredClone(animDebug),
    };
    return () => {
      delete window.__scene;
    };
  }, [camera, gl]);
  return null;
}

const FPS_SAMPLE_ms = 500;

/** Counts drawn frames and writes the rate to `ui.fps` twice a second (M2 `fps`). */
function FpsProbe() {
  const acc = useRef({ frames: 0, since_ms: performance.now() });
  useFrame(() => {
    const a = acc.current;
    a.frames++;
    const now_ms = performance.now();
    if (now_ms - a.since_ms < FPS_SAMPLE_ms) return;
    appStore.getState().ui.setFps((a.frames * 1000) / (now_ms - a.since_ms));
    a.frames = 0;
    a.since_ms = now_ms;
  });
  return null;
}

/** Camera preset buttons (`cam-*`, spec §8.2). */
function CameraButtons() {
  const current = useAppStore((s) => s.ui.camera);
  return (
    <div className="absolute right-3 top-3 flex gap-1">
      {CAMERA_ORDER.map((name) => (
        <button
          key={name}
          type="button"
          data-testid={`cam-${name}`}
          aria-pressed={current === name}
          onClick={() => appStore.getState().ui.setCamera(name)}
          className="rounded bg-slate-800/80 px-2 py-1 text-xs text-slate-100 hover:bg-slate-700 aria-pressed:bg-sky-700"
        >
          {CAMERA_PRESETS[name].label}
        </button>
      ))}
    </div>
  );
}

/** M1 viewport: the 3D bench in a full-size canvas with the camera presets. */
export function BenchViewport() {
  const start = CAMERA_PRESETS.overview;
  return (
    <div data-testid="viewport" className="relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [...start.position_m], fov: 40, near: 0.005, far: 20 }}
        onPointerMissed={() => appStore.getState().ui.select(null)}
      >
        <Look />
        <Bench />
        <OrbitControls makeDefault target={[...start.target_m]} />
        <CameraRig />
        <DebugProbe />
        <FpsProbe />
      </Canvas>
      <CameraButtons />
    </div>
  );
}
