// M12 legend and help content (spec §8.2, §13.3, §14) and the keyboard shortcuts.
import { CAMERA_ORDER } from '../scene/cameras.ts';
import { WIRE_COLORS, type WireColor } from '../shared/wiring.ts';
import type { CameraPreset } from '../store/slices/ui.ts';

/** §13.3 colour key, in the plan's order. */
export const WIRE_KEY: { color: WireColor; meaning: string }[] = [
  { color: 'red', meaning: '12 V' },
  { color: 'black', meaning: 'GND' },
  { color: 'orange', meaning: '5 V' },
  { color: 'pink', meaning: '3V3' },
  { color: 'blue', meaning: 'SDA' },
  { color: 'lightBlue', meaning: 'SCL' },
  { color: 'yellow', meaning: '1-Wire' },
  { color: 'green', meaning: 'analog' },
  { color: 'violet', meaning: 'tach' },
  { color: 'white', meaning: 'relay control' },
  { color: 'grey', meaning: 'USB, barrel cable' },
];
export const wireHex = (c: WireColor) => WIRE_COLORS[c];

/** §14, verbatim. */
export const GLOSSARY: { term: string; text: string }[] = [
  { term: 'a_RMS', text: 'root mean square of the vibration (after removing the steady part), in g, per 1 s window.' },
  { term: 'Crest factor (CF)', text: 'peak ÷ RMS; rises with impacts (looseness).' },
  { term: 'I_RMS', text: 'RMS of the calibrated fan current, in A.' },
  { term: 'dT/dt', text: 'temperature slope over the last 60 s, in °C/min.' },
  { term: 'RCF / RRCF', text: '(Robust) Random Cut Forest, an anomaly detector that scores how easily a point is isolated from the normal data.' }, // prettier-ignore
  { term: 'CoDisp', text: 'collusive displacement, the RRCF per-point score; here divided by the training size, so it runs ≈ 0–1.' }, // prettier-ignore
  { term: 'Dominant variable', text: 'the feature with the largest normalised deviation from the baseline.' },
  { term: 'NO / NC', text: 'normally open / normally closed relay contact. The fan is on NO2, so it runs only while the coil is energised.' }, // prettier-ignore
  { term: 'Persistence', text: 'number of consecutive alert windows needed to trip (`nCritical`).' },
  { term: 'Latched', text: 'after a trip the fan stays off until RESET, then START.' },
];

export type Shortcut =
  { kind: 'togglePlay' | 'start' | 'estop' | 'reset' | 'help' | 'close' } | { kind: 'camera'; preset: CameraPreset };

/** §8.2 keyboard map, for M12. */
export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'play / pause' },
  { keys: 'S', action: 'START' },
  { keys: 'E', action: 'E-STOP' },
  { keys: 'R', action: 'RESET (opens the confirmation)' },
  { keys: '1–5', action: 'camera presets: overview, fan, ESP32, relay, breadboard' },
  { keys: '?', action: 'this legend' },
  { keys: 'Esc', action: 'close a dialog' },
];

/** The action for a `KeyboardEvent.key`, or null. */
export function shortcutFor(key: string): Shortcut | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === ' ') return { kind: 'togglePlay' };
  if (k === 's') return { kind: 'start' };
  if (k === 'e') return { kind: 'estop' };
  if (k === 'r') return { kind: 'reset' };
  if (k === '?') return { kind: 'help' };
  if (k === 'Escape') return { kind: 'close' };
  const preset = /^[1-5]$/.test(k) ? CAMERA_ORDER[Number(k) - 1] : undefined;
  return preset ? { kind: 'camera', preset } : null;
}
