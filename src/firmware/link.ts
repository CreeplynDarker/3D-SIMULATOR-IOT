// "Wi-Fi" link model (spec §7.5). Uplink packets are dropped with probability packetLoss; each verdict comes back at
// window end + latency ± jitter, or when the RCF actually answers if that is later.
import type { Packet, Verdict } from '../shared/protocol.ts';
import { type RngStream, stream } from '../shared/rng.ts';
import type { SimConfig } from '../sim/types.ts';

export interface LinkState {
  rng: RngStream;
  latency_s: number;
  jitter_s: number;
  /** Nominal delivery time of the verdict for each packet sent (by seq). */
  scheduled: Map<number, number>;
  /** Verdicts waiting for delivery, earliest first. */
  queue: { due_s: number; verdict: Verdict }[];
  sent: number;
  dropped: number;
}

/** Link with its own RNG stream ("link"). */
export function createLink(seed: number, cfg: SimConfig): LinkState {
  return {
    rng: stream(seed, 'link'),
    latency_s: cfg.link.latency_s,
    jitter_s: cfg.link.latencyJitter_s,
    scheduled: new Map(),
    queue: [],
    sent: 0,
    dropped: 0,
  };
}

/**
 * Uplink of one window's packet at its end `tEnd_s`: dropped with probability `packetLoss` (0–1), otherwise handed to
 * `toRcf`. Returns whether it was sent. Both random draws happen every time, so the stream does not depend on the loss.
 */
export function sendPacket(
  link: LinkState,
  packet: Packet,
  tEnd_s: number,
  packetLoss: number,
  toRcf: (packet: Packet) => void,
): boolean {
  const lost = link.rng.uniform() < packetLoss;
  const jitter_s = (2 * link.rng.uniform() - 1) * link.jitter_s;
  if (lost) {
    link.dropped++;
    return false;
  }
  link.sent++;
  link.scheduled.set(packet.seq, tEnd_s + link.latency_s + jitter_s);
  toRcf(packet);
  return true;
}

/** A verdict from the RCF arriving at sim time `now_s`; it is delivered at its nominal time or now, whichever is later. */
export function receiveVerdict(link: LinkState, verdict: Verdict, now_s: number): void {
  const nominal_s = link.scheduled.get(verdict.seq_ref) ?? now_s;
  link.scheduled.delete(verdict.seq_ref);
  const due_s = Math.max(nominal_s, now_s);
  const i = link.queue.findIndex((q) => q.due_s > due_s);
  const entry = { due_s, verdict };
  if (i < 0) link.queue.push(entry);
  else link.queue.splice(i, 0, entry);
}

/** Removes and returns the verdicts due by sim time `now_s`, in delivery order. */
export function dueVerdicts(link: LinkState, now_s: number): Verdict[] {
  const out: Verdict[] = [];
  while (link.queue.length > 0 && (link.queue[0] as { due_s: number }).due_s <= now_s + 1e-9) {
    out.push((link.queue.shift() as { verdict: Verdict }).verdict);
  }
  return out;
}
