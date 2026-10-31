import type { StateCreator } from 'zustand/vanilla';
import type { CONFIG } from '../../shared/config.ts';
import type { Snapshot } from '../../shared/messages.ts';
import type { AppState } from '../index.ts';

/** Sim speed multiplier offered by the top bar (unitless, × real time). */
export type Speed = (typeof CONFIG.ui.speeds)[number];

export type SimSource = 'sim' | 'live' | 'replay';
export type LiveStatus = 'off' | 'connecting' | 'open' | 'closed';

export interface ReplayInfo {
  name: string;
  total: number;
  sent: number;
  skipped: number;
  done: boolean;
  error: string | null;
}

export interface SimSlice {
  sim: {
    snapshot: Snapshot | null;
    playing: boolean;
    speed: Speed;
    lagging: boolean;
    /** The §12 script being played from `sel-scenario`, if any. */
    scenario: { id: string; done: boolean } | null;
    /** Raw 1 kHz MPU6050 stream (`tgl-raw-mpu`): samples received and the newest x, y, z (g). */
    raw: { on: boolean; samples: number; last: [number, number, number] | null };
    /** Where the data comes from: the sim worker, the board through the bridge (P8.2), or a recorded session (P8.3). */
    source: SimSource;
    /** Live link to the bridge: its state and, when it can't connect, what to do. */
    live: { status: LiveStatus; message: string | null };
    /** performance.now() when the last snapshot arrived (live and replay draw between packets from it, ms). */
    snapshotWall_ms: number;
    /** The session being replayed (P8.3): its name, packets sent so far of the total, skipped entries, or an error. */
    replay: ReplayInfo | null;
    setSnapshot(snapshot: Snapshot): void;
    /** Forgets the last snapshot (a sim reset is under way; the worker sends a fresh one). */
    clearSnapshot(): void;
    setPlaying(playing: boolean): void;
    setSpeed(speed: Speed): void;
    setScenario(scenario: { id: string; done: boolean } | null): void;
    setRawOn(on: boolean): void;
    addRaw(samples: number, last: [number, number, number]): void;
    setSource(source: SimSource): void;
    setLive(status: LiveStatus, message?: string): void;
    /** A snapshot from live or replay data, stamped with the wall time it arrived (ms). */
    setLiveSnapshot(snapshot: Snapshot, wall_ms: number): void;
    setReplay(replay: ReplayInfo | null): void;
  };
}

/** Latest snapshot from the sim worker plus play state (spec §10.3). */
export const createSimSlice: StateCreator<AppState, [], [], SimSlice> = (set) => {
  const patch = (p: Partial<SimSlice['sim']>) => set((s) => ({ sim: { ...s.sim, ...p } }));
  return {
    sim: {
      snapshot: null,
      playing: false,
      speed: 1,
      lagging: false,
      scenario: null,
      raw: { on: false, samples: 0, last: null },
      source: 'sim',
      live: { status: 'off', message: null },
      snapshotWall_ms: 0,
      replay: null,
      setSnapshot: (snapshot) => patch({ snapshot, lagging: snapshot.lagging }),
      clearSnapshot: () => patch({ snapshot: null }),
      setPlaying: (playing) => patch({ playing }),
      setSpeed: (speed) => patch({ speed }),
      setScenario: (scenario) => patch({ scenario }),
      setSource: (source) => patch({ source }),
      setReplay: (replay) => patch({ replay }),
      setLive: (status, message) => patch({ live: { status, message: message ?? null } }),
      setLiveSnapshot: (snapshot, snapshotWall_ms) => patch({ snapshot, snapshotWall_ms, lagging: false }),
      setRawOn: (on) => patch({ raw: { on, samples: 0, last: null } }),
      addRaw: (samples, last) => set((s) => ({ sim: { ...s.sim, raw: { ...s.sim.raw, samples: s.sim.raw.samples + samples, last } } })), // prettier-ignore
    },
  };
};
