// Display formatting for the UI modules: text only, no physics.

/** Sim time (s) as `mm:ss.s` for `sim-clock` (§8.2); minutes keep counting past 59. */
export function formatClock(t_s: number): string {
  const tenths = Math.round(Math.max(0, t_s) * 10);
  const min = Math.floor(tenths / 600);
  const sec = (tenths % 600) / 10;
  return `${String(min).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`;
}

/** `relay-state` text from the CH2 contact (§8.2). */
export function relayText(contact: 'NC' | 'NO'): string {
  return contact === 'NO' ? 'CH2 NO closed' : 'CH2 open';
}

/** `persistence` as "k/N": consecutive alerts so far over the alerts needed to trip. */
export function persistenceText(alertRun: number, nCritical: number): string {
  return `${alertRun}/${nCritical}`;
}

/** `rcf-gauge` text: normalised score / threshold, both unitless; "—" when the window wasn't scored. */
export function formatGauge(score: number | null, threshold: number): string {
  return `${score === null ? '—' : score.toFixed(2)} / ${threshold.toFixed(2)}`;
}

/** State colours from §8.1, by name; components map them to classes. */
export const STATE_TONE = {
  OFF: 'grey',
  CALIBRATING: 'blue',
  STARTING: 'blue',
  NORMAL: 'green',
  WARNING: 'amber',
  CRITICAL: 'red',
} as const;
export type Tone = (typeof STATE_TONE)[keyof typeof STATE_TONE];

/** Tailwind classes for each state colour (badges, chart bands use the same names). */
export const TONE_CLASS: Record<Tone, string> = {
  grey: 'bg-slate-500 text-white',
  blue: 'bg-sky-600 text-white',
  green: 'bg-emerald-600 text-white',
  amber: 'bg-amber-500 text-slate-950',
  red: 'bg-red-600 text-white',
};
