// Camera presets for M1 (`cam-*` buttons, keys 1–5). Positions and targets in world metres.
import type { Vec3 } from '../shared/components.ts';
import type { CameraPreset } from '../store/slices/ui.ts';

export interface CameraPose {
  position_m: Vec3;
  target_m: Vec3;
  label: string;
}

export const CAMERA_PRESETS: Record<CameraPreset, CameraPose> = {
  overview: { position_m: [0.03, 0.4, 0.52], target_m: [0.04, 0, -0.03], label: 'Overview' },
  fan: { position_m: [-0.12, 0.13, 0.12], target_m: [-0.2, 0.052, -0.05], label: 'Fan' },
  esp32: { position_m: [0.025, 0.12, 0.175], target_m: [0.022, 0.014, 0.08], label: 'ESP32' },
  relay: { position_m: [0.215, 0.13, -0.185], target_m: [0.135, 0.008, -0.08], label: 'Relay' },
  breadboard: { position_m: [0.05, 0.24, 0.21], target_m: [0.05, 0.005, 0.075], label: 'Breadboard' },
};

/** Order of the preset buttons (and of keys 1–5). */
export const CAMERA_ORDER: readonly CameraPreset[] = ['overview', 'fan', 'esp32', 'relay', 'breadboard'];

/** Length of the eased move between presets, in ms. */
export const CAMERA_TRANSITION_ms = 600;

/** Ease-in-out cubic on t ∈ [0, 1]. */
export function easeInOutCubic(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}
