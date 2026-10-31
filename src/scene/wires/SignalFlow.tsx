// P6.2 signal flow (spec §11 P6.2, §13.3): power nets glow while energised and a switched net dims when it isn't;
// data nets carry pulses paced by real traffic: I²C and ADC continuous, tach with the fan speed, 1-Wire once per
// DS18B20 read. Everything follows the snapshot's sim time, so a paused sim freezes it (D-058).
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CatmullRomCurve3, Color, type Sprite, Vector3 } from 'three';
import { CONFIG } from '../../shared/config.ts';
import type { Net } from '../../shared/wiring.ts';
import { WIRE_COLORS } from '../../shared/wiring.ts';
import { appStore } from '../../store/index.ts';
import { continuousU, pulseU, travel_s, wireEnergised } from '../anim.ts';
import { animDebug } from '../animDebug.ts';
import { getGlowMaterial } from '../models/materials.ts';
import { benchRoutes } from './route.ts';
import { wireMaterials } from './Wires.tsx';

const GLOW_NETS: readonly Net[] = ['V12', 'V12_SW', 'V5', 'V3V3', 'RELAY_IN'];
const GLOW_INTENSITY = 0.6;
const DIM = { toward: new Color('#2a2a2a'), amount: 0.7 };
/** Pulse trains: laps per sim second at rated speed (tach) or always (I²C, ADC). */
const TRAINS: Partial<Record<Net, { rate: number; n: number; follows: 'always' | 'rpm' }>> = {
  SDA: { rate: 1.5, n: 3, follows: 'always' },
  SCL: { rate: 1.5, n: 3, follows: 'always' },
  ANALOG: { rate: 1, n: 3, follows: 'always' },
  TACH: { rate: 1.5, n: 3, follows: 'rpm' },
};
/** A 1-Wire read crosses both 1-Wire wires in this much wall time (scaled by the sim speed, capped). */
const ONEWIRE = { wall_s: 0.35, cap_s: 0.6 };
const PULSE_m = 0.004;
const LOG_MAX = 200;

interface Lane {
  id: string;
  net: Net;
  curve: CatmullRomCurve3;
  /** Index of this wire among the wires of its net, for the 1-Wire relay (probe → node → ESP32). */
  hop: number;
  sprites: (Sprite | null)[];
}

/** Sets a wire's colour and glow, only when its state changes, and logs energised changes with their sim time. */
function paintWire(id: string, energised: boolean, glow: boolean, t_s: number): void {
  const m = wireMaterials.get(id);
  const prev = animDebug.flow.wires[id];
  if (!m || (prev && prev.energised === energised && prev.glow === glow)) return;
  const base = new Color(WIRE_COLORS[benchRoutes().find((r) => r.id === id)?.color ?? 'grey']);
  m.color.copy(energised ? base : base.clone().lerp(DIM.toward, DIM.amount));
  m.emissive.copy(glow ? base : new Color(0));
  m.emissiveIntensity = glow ? GLOW_INTENSITY : 0;
  animDebug.flow.wires[id] = { energised, glow };
  if (!prev || prev.energised !== energised) {
    animDebug.flow.log.push({ id, energised, t_s });
    if (animDebug.flow.log.length > LOG_MAX) animDebug.flow.log.shift();
  }
}

/** Wire glow and data pulses; mounted next to the wires. */
export function SignalFlow() {
  const lanes = useRef<Lane[]>([]);
  const built = useMemo(() => {
    const out: Lane[] = [];
    const hops = new Map<Net, number>();
    for (const r of benchRoutes()) {
      if (!TRAINS[r.net] && r.net !== 'ONEWIRE') continue;
      const hop = hops.get(r.net) ?? 0;
      hops.set(r.net, hop + 1);
      const curve = new CatmullRomCurve3(
        r.points_m.map((p) => new Vector3(...p)),
        false,
        'centripetal',
      );
      out.push({ id: r.id, net: r.net, curve, hop, sprites: [] });
    }
    lanes.current = out;
    return out;
  }, []);
  const mat = useMemo(() => getGlowMaterial('#ffffff'), []);

  useFrame(() => {
    const s = appStore.getState();
    const snap = s.sim.snapshot;
    const flow = s.ui.toggles.flow;
    const t_s = snap?.t_s ?? 0;
    for (const r of benchRoutes()) {
      const energised = snap ? wireEnergised(r.net, snap.contact, snap.gpio26) : r.net !== 'V12_SW';
      paintWire(r.id, energised, flow && energised && GLOW_NETS.includes(r.net), t_s);
    }
    let visible = 0;
    const read_s = travel_s(s.sim.speed, ONEWIRE.wall_s, ONEWIRE.cap_s);
    for (const lane of lanes.current) {
      const train = TRAINS[lane.net];
      lane.sprites.forEach((sp, k) => {
        if (!sp) return;
        let u: number | null = null;
        if (flow && snap && train) {
          const speed = train.follows === 'rpm' ? (train.rate * snap.rpm) / CONFIG.fan.rpmRated : train.rate;
          u = train.follows === 'rpm' && snap.rpm < 1 ? null : continuousU(t_s, speed, k, train.n);
        } else if (flow && snap && lane.net === 'ONEWIRE' && k === 0) {
          // probe → breadboard node over the first half, node → ESP32 over the second
          const whole = pulseU(t_s, snap.traffic.lastDsRead_s, read_s);
          const half = whole === null ? null : whole * 2 - lane.hop;
          u = half !== null && half >= 0 && half <= 1 ? half : null;
        }
        sp.visible = u !== null;
        if (u !== null) {
          sp.position.copy(lane.curve.getPointAt(u));
          visible++;
        }
      });
    }
    animDebug.flow.pulses = visible;
  });

  return (
    <group name="signal-flow">
      {built.map((lane) =>
        Array.from({ length: TRAINS[lane.net]?.n ?? 1 }, (_, k) => (
          <sprite
            key={`${lane.id}:${k}`}
            ref={(el) => void (lane.sprites[k] = el)}
            material={mat}
            scale={[PULSE_m, PULSE_m, 1]}
            visible={false}
          />
        )),
      )}
    </group>
  );
}
