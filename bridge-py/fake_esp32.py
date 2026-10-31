"""Emulated ESP32 for the live bridge (P8.1). It speaks the board's UDP protocol (reference-cpp/main.cpp, D-070):
packets go to the bridge's port 4211 as JSON datagrams; verdicts and commands arrive on port 4210.

Two modes:
  emulate (default)  runs scripts/esp32-emulator.ts, the simulator's real TS plant and firmware, so the state machine,
                     the link timeout and the reaction to START/RESET/ESTOP and to verdicts are the real ones.
  --replay FILE      sends the packets of a recorded session (bridge JSON lines, or the M7 JSON export) on their
                     original timing; it does not react to anything.

Every packet sent, verdict and command received and firmware event is printed as a timestamped run log.

  python fake_esp32.py [--bridge-host 127.0.0.1] [--bridge-port 4211] [--listen-port 4210] [--speed 10]
                       [--fault imbalance_g=0.3@60] [--seed N] [--replay session.jsonl]
"""
from __future__ import annotations

import argparse
import json
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def log(t_s: float | None, text: str) -> None:
    stamp = "t=   --.---" if t_s is None else f"t={t_s:9.3f}"
    print(f"[{stamp}] {text}", flush=True)


def packet_line(p: dict) -> str:
    t = "—" if p.get("t_C") is None else f"{p['t_C']:.2f}"
    return (f"↑ #{p['seq']} {p['state']} rpm={round(p['rpm'])} a={p['a_rms_g']:.3f}g I={p['i_rms_A']:.3f}A T={t} "
            f"relay={p['relay_ch2']} link_lost={str(p['link_lost']).lower()} trip={p['trip_reason'] or '—'}")


def verdict_line(v: dict) -> str:
    score = "—" if v.get("score") is None else f"{v['score']:.2f}"
    word = "unscored" if v.get("score") is None else "ALERT" if v["alert"] else "clear" if v["clear"] else "hold"
    return f"↓ verdict #{v['seq_ref']} score={score}/{v['threshold']:.2f} {word} dom={v.get('dominant') or '—'}"


class Board:
    """The UDP side: one socket bound to the listen port, sending to the bridge."""

    def __init__(self, bridge: tuple[str, int], listen_port: int):
        self.bridge = bridge
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("0.0.0.0", listen_port))
        self.sock.settimeout(0.2)
        self.t_s: float | None = None

    def send(self, packet: dict) -> None:
        self.t_s = packet["ts_ms"] / 1000
        self.sock.sendto(json.dumps(packet, separators=(",", ":")).encode(), self.bridge)
        log(self.t_s, packet_line(packet))

    def receive(self, deliver) -> None:
        """Forever: each verdict or command datagram is logged and handed to `deliver` (raw JSON text)."""
        while True:
            try:
                data, _ = self.sock.recvfrom(65535)
            except socket.timeout:
                continue
            except OSError:
                return
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                log(self.t_s, f"! dropped a datagram that is not JSON ({len(data)} bytes)")
                continue
            if msg.get("kind") == "verdict":
                log(self.t_s, verdict_line(msg))
            elif msg.get("kind") == "command":
                log(self.t_s, f"↓ command {msg.get('cmd')}")
            deliver(data.decode())


def emulate(board: Board, args) -> int:
    cmd = ["node", str(ROOT / "scripts" / "esp32-emulator.ts"), "--speed", str(args.speed), "--seed", str(args.seed)]
    for f in args.fault:
        cmd += ["--fault", f]
    proc = subprocess.Popen(cmd, cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)

    def deliver(text: str) -> None:
        if proc.stdin and proc.poll() is None:
            proc.stdin.write(text + "\n")
            proc.stdin.flush()

    threading.Thread(target=board.receive, args=(deliver,), daemon=True).start()
    try:
        for line in proc.stdout or []:
            m = json.loads(line)
            if m["type"] == "packet":
                board.send(m["packet"])
            elif m["type"] == "event":
                e = m["event"]
                log(e["t_s"], f"* {e['type']}" + (f" ({e['detail']})" if e.get("detail") else ""))
            elif m["type"] == "log":
                print(f"  {m['line']}", flush=True)
            elif m["type"] == "ready":
                log(0, f"emulated ESP32 ready: speed {m['speed']}×, seed {m['seed']}, UDP → {board.bridge[0]}:{board.bridge[1]}")  # noqa: E501
    except KeyboardInterrupt:
        pass
    finally:
        proc.terminate()
    return 0


def session_packets(path: Path) -> list[dict]:
    """Packets from a bridge session (JSON lines) or an M7 JSON export ({"packets": [...]})."""
    text = path.read_text(encoding="utf-8")
    if text.lstrip().startswith("{") and '"packets"' in text[:200]:
        return list(json.loads(text)["packets"])
    lines = (json.loads(line) for line in text.splitlines() if line.strip())
    return [line["msg"] for line in lines if line.get("dir") == "up" and "msg" in line]


def replay(board: Board, args) -> int:
    packets = session_packets(Path(args.replay))
    threading.Thread(target=board.receive, args=(lambda _t: None,), daemon=True).start()
    t0_wall = time.monotonic()
    t0_ms = packets[0]["ts_ms"] if packets else 0
    for p in packets:
        due = t0_wall + (p["ts_ms"] - t0_ms) / 1000 / args.speed
        time.sleep(max(0.0, due - time.monotonic()))
        board.send(p)
    log(board.t_s, f"replay done: {len(packets)} packets")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--bridge-host", default="127.0.0.1")
    p.add_argument("--bridge-port", type=int, default=4211)
    p.add_argument("--listen-port", type=int, default=4210)
    p.add_argument("--speed", type=float, default=1.0, help="sim seconds per wall second")
    p.add_argument("--seed", type=int, default=20261029)
    p.add_argument("--fault", action="append", default=[], help="key=value@t_s, e.g. imbalance_g=0.3@60")
    p.add_argument("--replay", help="send a recorded session's packets instead of emulating")
    args = p.parse_args()
    board = Board((args.bridge_host, args.bridge_port), args.listen_port)
    return replay(board, args) if args.replay else emulate(board, args)


if __name__ == "__main__":
    sys.exit(main())
