// Replay (P8.3): a recorded session's packets fed through the live path (createPacketPath) on their own timing,
// at the top bar's speed, paused and resumed with its Play button. Verdicts are recomputed by the RCF worker.
import { appStore } from '../store/index.ts';
import { createPacketPath, type PostRcf } from './live.ts';
import { dueCount, type Session } from './session.ts';

const TICK_ms = 50;

export interface ReplaySession {
  stop(): void;
}

/** Starts feeding `session` (named `name`) from its first packet; plays at once. */
export function startReplay(postRcf: PostRcf, session: Session, name: string): ReplaySession {
  const s = () => appStore.getState();
  const path = createPacketPath(postRcf, () => undefined);
  const { packets } = session;
  let replay_s = 0;
  let sent = 0;
  let last_ms = performance.now();
  s().sim.setReplay({ name, total: packets.length, sent: 0, skipped: session.skipped, done: false, error: null });
  s().sim.setPlaying(true);
  const timer = setInterval(() => {
    const now_ms = performance.now();
    const sim = s().sim;
    if (sim.playing) replay_s += ((now_ms - last_ms) / 1000) * sim.speed;
    last_ms = now_ms;
    const due = dueCount(packets, replay_s);
    if (due === sent) return;
    while (sent < due) path.ingest(packets[sent++] as (typeof packets)[number]);
    const done = sent === packets.length;
    s().sim.setReplay({ name, total: packets.length, sent, skipped: session.skipped, done, error: null });
    if (done) s().sim.setPlaying(false);
  }, TICK_ms);
  return {
    stop: () => {
      clearInterval(timer);
      path.close();
    },
  };
}
