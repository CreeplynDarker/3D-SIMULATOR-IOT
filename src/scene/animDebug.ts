// What the animated parts drew last frame, for the e2e tests (`window.__scene.anim()`, only with `?debug=1`).
// Components overwrite plain fields in useFrame; nothing reads it back.

export interface WireChange {
  id: string;
  energised: boolean;
  t_s: number;
}

export const animDebug = {
  flow: {
    wires: {} as Record<string, { energised: boolean; glow: boolean }>,
    /** Every energised/de-energised change seen, with the snapshot's sim time (newest last, capped). */
    log: [] as WireChange[],
    pulses: 0,
  },
  wifi: { up: null as number | null, down: null as number | null, flash: 0, packets: 0, verdicts: 0, dropped: 0 },
  labels: 0,
  relay: { arm: 'NC' as 'NC' | 'NO', led: false, changes: 0, clicks: 0 },
  fan: { bladeAngle_rad: 0, bladeOpacity: 1, discOpacity: 0, jitterAmp_mm: 0, jitter_mm: [0, 0] as [number, number], airflowVisible: false }, // prettier-ignore
};

export type AnimDebug = typeof animDebug;
