// Recorded sessions for replay (P8.3): the bridge's JSON-lines session file or the M7 JSON export, read as the
// packets the board sent, in time order. Pure.
import { Packet } from '../shared/protocol.ts';

export interface Session {
  packets: Packet[];
  /** Lines or entries that looked like packets but failed the protocol, or weren't JSON at all. */
  skipped: number;
  format: 'bridge' | 'export';
}

/** Parses a session file; throws if it holds no valid packet. */
export function parseSession(text: string): Session {
  const trimmed = text.trim();
  let candidates: unknown[] = [];
  let skipped = 0;
  let format: Session['format'] = 'bridge';
  try {
    const whole = JSON.parse(trimmed) as { packets?: unknown };
    if (whole && typeof whole === 'object' && Array.isArray(whole.packets)) {
      format = 'export';
      candidates = whole.packets;
    }
  } catch {
    // not one JSON document: JSON lines
  }
  if (format === 'bridge') {
    for (const line of trimmed.split('\n')) {
      if (!line.trim()) continue;
      try {
        const l = JSON.parse(line) as { dir?: string; msg?: { kind?: string } };
        if (l.dir === 'up' && l.msg?.kind === 'packet') candidates.push(l.msg);
      } catch {
        skipped++;
      }
    }
  }
  const packets: Packet[] = [];
  for (const c of candidates) {
    const p = Packet.safeParse(c);
    if (p.success) packets.push(p.data);
    else skipped++;
  }
  if (packets.length === 0) throw new Error('no packets in this file (expected a bridge session or an M7 JSON export)');
  packets.sort((a, b) => a.ts_ms - b.ts_ms);
  return { packets, skipped, format };
}

/** How many packets are due `replay_s` seconds (sim time) after the first one. */
export function dueCount(packets: readonly Packet[], replay_s: number): number {
  const t0 = packets[0]?.ts_ms ?? 0;
  let n = 0;
  while (n < packets.length && ((packets[n] as Packet).ts_ms - t0) / 1000 <= replay_s + 1e-9) n++;
  return n;
}
