// Live and replay modes (P8.2, P8.3): a Snapshot built from the board's packets, the events their changes imply, and
// the scene's display time between packets. Pure: it maps fields, it computes no physics.
import type { SimEvent, SimEventType, Snapshot } from '../shared/messages.ts';
import type { Packet } from '../shared/protocol.ts';
import { rpmToRadps } from '../shared/units.ts';

/** Snapshot fields the board doesn't send: M3 and M9 show them as "—". */
export const LIVE_UNKNOWN: readonly (keyof Snapshot)[] = [
  'theta_rad',
  'fanV_V',
  'current_A',
  'tMotor_C',
  'accel_g',
  'acsOut_V',
  'adcPin_V',
  'adcCounts',
  'tachHigh',
  'alertRun',
  'activeMap',
  'faults',
];

const NO_FAULTS: Snapshot['faults'] = {
  imbalance_g: 0,
  looseness: 0,
  friction: 0,
  overheat: 0,
  supplySag_V: 0,
  packetLoss: 0,
  ds18b20Disconnect: false,
};

/** The snapshot after `p`; `prev` carries the last temperature and the traffic counts. */
export function liveSnapshot(p: Packet, prev: Snapshot | null, ctx: { nCritical: number }): Snapshot {
  const t_s = p.ts_ms / 1000;
  const on = p.relay_ch2 === 'ON';
  const t_C = p.t_C ?? prev?.tProbe_C ?? 0;
  const traffic = prev?.traffic ?? { packets: 0, dropped: 0, verdicts: 0, dsReads: 0, lastPacket_s: -Infinity, lastDrop_s: -Infinity, lastVerdict_s: -Infinity, lastDsRead_s: -Infinity }; // prettier-ignore
  return {
    t_s,
    rpm: p.rpm,
    omega_radps: rpmToRadps(p.rpm),
    theta_rad: 0,
    fanV_V: 0,
    current_A: 0,
    tMotor_C: t_C,
    tProbe_C: t_C,
    coilOn: on,
    contact: on ? 'NO' : 'NC',
    gpio26: on ? 0 : 1,
    state: p.state,
    faults: NO_FAULTS,
    accel_g: [0, 0, 0],
    acsOut_V: 0,
    adcPin_V: 0,
    adcCounts: 0,
    dsReading_C: t_C,
    tachHigh: false,
    alertRun: 0,
    nCritical: ctx.nCritical,
    linkLost: p.link_lost,
    sensorFault: p.sensor_fault,
    tripReason: p.trip_reason,
    activeMap: null,
    traffic: { ...traffic, packets: traffic.packets + 1, lastPacket_s: t_s },
    lagging: false,
    unknown: LIVE_UNKNOWN,
  };
}

const STATE_EVENT: Partial<Record<Packet['state'], SimEventType>> = {
  CALIBRATING: 'START',
  NORMAL: 'NORMAL',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
};

/** Events implied by the change from packet `prev` to packet `p`, timed at `p`'s window end (s). */
export function packetEvents(prev: Packet | null, p: Packet): SimEvent[] {
  if (!prev) return [];
  const t_s = p.ts_ms / 1000;
  const out: SimEvent[] = [];
  if (p.state !== prev.state) {
    const type = prev.state === 'CRITICAL' && p.state === 'OFF' ? 'RESET' : STATE_EVENT[p.state];
    if (type) out.push(p.state === 'CRITICAL' && p.trip_reason ? { t_s, type, detail: p.trip_reason } : { t_s, type });
  }
  if (p.relay_ch2 !== prev.relay_ch2) out.push({ t_s, type: p.relay_ch2 === 'ON' ? 'RELAY_CLOSED' : 'RELAY_OPEN' });
  if (p.link_lost !== prev.link_lost) out.push({ t_s, type: p.link_lost ? 'LINK_LOST' : 'LINK_RESTORED' });
  if (p.sensor_fault !== prev.sensor_fault) out.push({ t_s, type: p.sensor_fault ? 'SENSOR_FAULT' : 'SENSOR_OK' });
  return out;
}

/** Display time (s) between packets: the last packet's time plus wall time × `rate`, at most one window ahead. */
export function sceneTime(packet_s: number, sinceWall_ms: number, rate: number): number {
  return packet_s + Math.min(1, (sinceWall_ms / 1000) * rate);
}
