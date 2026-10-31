import { describe, expect, it } from 'vitest';
import { LIVE_UNKNOWN, liveSnapshot, packetEvents, sceneTime } from '../../../src/bridge/liveSnapshot.ts';
import { type Packet, PROTOCOL_VERSION } from '../../../src/shared/protocol.ts';

const packet = (seq: number, extra: Partial<Packet> = {}): Packet => ({
  v: PROTOCOL_VERSION, kind: 'packet', seq, ts_ms: (seq + 1) * 1000, win_ms: 1000, a_rms_g: 0.121, cf: 2.5,
  i_rms_A: 0.181, t_C: 34.06, dtdt_C_per_min: 0, rpm: 3810, state: 'NORMAL', relay_ch2: 'ON', link_lost: false,
  sensor_fault: false, warn_reason: null, trip_reason: null, ...extra,
}); // prettier-ignore

describe('live snapshot from packets (P8.2)', () => {
  it('maps what the board sends and marks the rest unknown', () => {
    const s = liveSnapshot(packet(9), null, { nCritical: 5 });
    expect(s).toMatchObject({ t_s: 10, rpm: 3810, state: 'NORMAL', contact: 'NO', coilOn: true, gpio26: 0, tProbe_C: 34.06, dsReading_C: 34.06, linkLost: false, sensorFault: false, tripReason: null, nCritical: 5, activeMap: null }); // prettier-ignore
    expect(s.omega_radps).toBeCloseTo((3810 * 2 * Math.PI) / 60, 9);
    expect(s.unknown).toEqual(LIVE_UNKNOWN);
    for (const k of [
      'fanV_V',
      'current_A',
      'tMotor_C',
      'accel_g',
      'acsOut_V',
      'adcPin_V',
      'adcCounts',
      'tachHigh',
      'alertRun',
      'theta_rad',
    ]) {
      // prettier-ignore
      expect(s.unknown, k).toContain(k);
    }
    const off = liveSnapshot(packet(10, { relay_ch2: 'OFF', state: 'CRITICAL', trip_reason: 'RCF', t_C: null }), s, { nCritical: 5 }); // prettier-ignore
    expect(off).toMatchObject({ contact: 'NC', coilOn: false, gpio26: 1, tripReason: 'RCF', tProbe_C: 34.06 }); // keeps the last temperature
  });

  it('counts traffic: packets and their sim time', () => {
    const a = liveSnapshot(packet(0), null, { nCritical: 5 });
    const b = liveSnapshot(packet(1), a, { nCritical: 5 });
    expect(b.traffic).toMatchObject({ packets: 2, lastPacket_s: 2, dropped: 0 });
  });

  it('turns state, relay and link changes between packets into events', () => {
    expect(packetEvents(null, packet(0, { state: 'OFF', relay_ch2: 'OFF' }))).toEqual([]);
    const ev = packetEvents(packet(0, { state: 'NORMAL' }), packet(1, { state: 'CRITICAL', relay_ch2: 'OFF', link_lost: true, trip_reason: 'RCF' })); // prettier-ignore
    expect(ev.map((e) => e.type)).toEqual(['CRITICAL', 'RELAY_OPEN', 'LINK_LOST']);
    expect(ev.every((e) => e.t_s === 2)).toBe(true);
    expect(packetEvents(packet(4, { state: 'CRITICAL', relay_ch2: 'OFF', link_lost: true }), packet(5, { state: 'OFF', relay_ch2: 'OFF' })).map((e) => e.type)).toEqual(['RESET', 'LINK_RESTORED']); // prettier-ignore
    expect(packetEvents(packet(5, { state: 'OFF', relay_ch2: 'OFF' }), packet(6, { state: 'CALIBRATING', relay_ch2: 'OFF' })).map((e) => e.type)).toEqual(['START']); // prettier-ignore
  });

  it('scene time runs on from the last packet at the replay rate, at most one window, and stops when paused', () => {
    expect(sceneTime(10, 0, 1)).toBe(10);
    expect(sceneTime(10, 400, 1)).toBeCloseTo(10.4, 9);
    expect(sceneTime(10, 400, 4)).toBe(11);
    expect(sceneTime(10, 400, 0)).toBe(10);
  });
});
