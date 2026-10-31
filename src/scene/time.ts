// The time the scene draws at (s). In the simulation it is the snapshot's sim time, so a paused sim draws the same
// frame (rule 6). In Live and Replay (P8.2, P8.3) packets come once per window, so the scene runs on from the last
// one: live at wall speed, a replay at its speed and not at all while paused.
import { sceneTime } from '../bridge/liveSnapshot.ts';
import type { AppState } from '../store/index.ts';

/** Display time in s for the current data source. */
export function displayTime(s: AppState): number {
  const snap = s.sim.snapshot;
  if (!snap) return 0;
  if (s.sim.source === 'sim') return snap.t_s;
  const rate = s.sim.source === 'live' ? 1 : s.sim.playing ? s.sim.speed : 0;
  return sceneTime(snap.t_s, performance.now() - s.sim.snapshotWall_ms, rate);
}

/** Blade angle (rad): the plant's in the simulation; from the board's rpm × display time in Live and Replay. */
export function bladeAngle(s: AppState): number {
  const snap = s.sim.snapshot;
  if (!snap) return 0;
  if (!snap.unknown?.includes('theta_rad')) return snap.theta_rad;
  return (snap.omega_radps * displayTime(s)) % (2 * Math.PI);
}
