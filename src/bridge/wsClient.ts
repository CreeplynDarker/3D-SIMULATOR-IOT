// WebSocket client for the live bridge (P8.2, D-070): packets arrive from the board through the bridge; verdicts
// and commands go back. The bridge serves the app, so the socket is same-origin at /ui (D-072).
import { Packet } from '../shared/protocol.ts';
import type { Command, Verdict } from '../shared/protocol.ts';

export type Up = { type: 'verdict'; verdict: Verdict } | { type: 'command'; command: Command };

export interface LiveLink {
  send(msg: Up): void;
  close(): void;
}

export interface LiveHandlers {
  onOpen(): void;
  /** A packet from the board, already checked against the protocol. */
  onPacket(packet: Packet): void;
  /** The socket closed; `everOpened` is false when the bridge could not be reached at all. */
  onClose(everOpened: boolean): void;
}

/** `ws(s)://<this page's host>/ui`. */
export function bridgeUrl(location: { protocol: string; host: string }): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ui`;
}

/** Opens the link; messages that aren't valid packets are ignored (the bridge has validated them already). */
export function connectLive(url: string, h: LiveHandlers): LiveLink {
  const ws = new WebSocket(url);
  let opened = false;
  ws.addEventListener('open', () => {
    opened = true;
    h.onOpen();
  });
  ws.addEventListener('message', (e: MessageEvent<string>) => {
    let msg: unknown;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    const m = msg as { type?: string; packet?: unknown };
    if (m.type !== 'packet') return;
    const p = Packet.safeParse(m.packet);
    if (p.success) h.onPacket(p.data);
  });
  ws.addEventListener('close', () => h.onClose(opened));
  return {
    send: (msg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close: () => ws.close(),
  };
}
