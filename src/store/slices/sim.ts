import type { StateCreator } from 'zustand/vanilla';
import type { CONFIG } from '../../shared/config.ts';
import type { Snapshot } from '../../shared/messages.ts';
import type { AppState } from '../index.ts';

/** Sim speed multiplier offered by the top bar (unitless, × real time). */
export type Speed = (typeof CONFIG.ui.speeds)[number];

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
    setSnapshot(snapshot: Snapshot): void;
    /** Forgets the last snapshot (a sim reset is under way; the worker sends a fresh one). */
    clearSnapshot(): void;
    setPlaying(playing: boolean): void;
    setSpeed(speed: Speed): void;
    setScenario(scenario: { id: string; done: boolean } | null): void;
    setRawOn(on: boolean): void;
    addRaw(samples: number, last: [number, number, number]): void;
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
      setSnapshot: (snapshot) => patch({ snapshot, lagging: snapshot.lagging }),
      clearSnapshot: () => patch({ snapshot: null }),
      setPlaying: (playing) => patch({ playing }),
      setSpeed: (speed) => patch({ speed }),
      setScenario: (scenario) => patch({ scenario }),
      setRawOn: (on) => patch({ raw: { on, samples: 0, last: null } }),
      addRaw: (samples, last) => set((s) => ({ sim: { ...s.sim, raw: { ...s.sim.raw, samples: s.sim.raw.samples + samples, last } } })), // prettier-ignore
    },
  };
};
