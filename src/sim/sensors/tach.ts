// Fan tach output (spec §6.7): `tachPulsesPerRev` open-collector pulses per revolution, counted on rising edges.

export interface TachState {
  /** floor(θ / 2π · pulses per rev). */
  pulsesTotal: number;
  /** Rising edges since start (what the PCNT counts). */
  edges: number;
  /** Pin level for the 3D LED: HIGH when `pulsesTotal` is even. */
  high: boolean;
}

/** Tach at rest (no pulses, pin HIGH). */
export function createTach(): TachState {
  return { pulsesTotal: 0, edges: 0, high: true };
}

/** Updates the pulse count for rotor angle `theta_rad` (rad). */
export function stepTach(tach: TachState, theta_rad: number, pulsesPerRev: number): void {
  const total = Math.floor((theta_rad / (2 * Math.PI)) * pulsesPerRev);
  if (total > tach.pulsesTotal) tach.edges += total - tach.pulsesTotal;
  tach.pulsesTotal = total;
  tach.high = total % 2 === 0;
}
