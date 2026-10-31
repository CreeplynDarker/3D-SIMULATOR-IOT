// Display formatting for the UI modules: text only, no physics.

/** Sim time (s) as `mm:ss.s` for `sim-clock` (§8.2); minutes keep counting past 59. */
export function formatClock(t_s: number): string {
  const tenths = Math.round(Math.max(0, t_s) * 10);
  const min = Math.floor(tenths / 600);
  const sec = (tenths % 600) / 10;
  return `${String(min).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`;
}
