"""Live bridge between the ESP32 and the browser (docs/PLAN.md §11 P8.1, D-070 to D-072).

ESP32 -> bridge: one JSON packet per UDP datagram on port 4211.
bridge -> ESP32: verdicts and commands as UDP datagrams to the board's port 4210.
browser <-> bridge: a WebSocket at /ui. Down: {"type": "packet", "packet": {...}}. Up: {"type": "verdict",
"verdict": {...}} or {"type": "command", "command": {...}}.

Every message is validated against public/schema/*.schema.json; an invalid one is dropped and counted. Every
message (and every drop) is written to a JSON-lines session file that the simulator can replay (P8.3). The bridge
does not score anything: the browser's RCF worker sends the verdicts (D-071). It also serves the built dist/, so the
app and its WebSocket share one origin (D-072).

Run: python app.py [--port 8765] [--udp-port 4211] [--esp32-host HOST] [--esp32-port 4210]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
KINDS = ("packet", "verdict", "command")


def load_validators(schema_dir: Path) -> dict[str, Draft202012Validator]:
    """One validator per protocol message kind, from the generated JSON Schemas (§10.1)."""
    out = {}
    for kind in KINDS:
        schema = json.loads((schema_dir / f"{kind}.schema.json").read_text(encoding="utf-8"))
        out[kind] = Draft202012Validator(schema)
    return out


class SessionLog:
    """JSON lines: {"t_ms": ms since the bridge started, "dir": "up"|"down", "msg": ...} or a dropped message."""

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._f = path.open("a", encoding="utf-8", newline="\n")
        self._t0 = time.monotonic()

    def write(self, direction: str, msg: object | None = None, invalid: str | None = None, raw: str | None = None):
        line: dict = {"t_ms": round((time.monotonic() - self._t0) * 1000, 1), "dir": direction}
        if invalid is None:
            line["msg"] = msg
        else:
            line["invalid"] = invalid
            line["raw"] = raw
        self._f.write(json.dumps(line, separators=(",", ":")) + "\n")
        self._f.flush()

    def close(self):
        self._f.close()


class Bridge:
    """Validates and relays messages between the board (UDP) and the browsers (WebSocket)."""

    def __init__(self, validators, session: SessionLog, esp32_host: str | None, esp32_port: int):
        self.validators = validators
        self.session = session
        self.esp32_host = esp32_host
        self.esp32_port = esp32_port
        self.board: tuple[str, int] | None = (esp32_host, esp32_port) if esp32_host else None
        self.counts = {"packet": 0, "verdict": 0, "command": 0, "invalid_up": 0, "invalid_down": 0}
        self.clients: set[WebSocket] = set()
        self.transport: asyncio.DatagramTransport | None = None

    def check(self, kind: str, msg: object) -> str | None:
        """None if `msg` is a valid `kind` message, else the first schema error."""
        if not isinstance(msg, dict) or msg.get("kind") != kind:
            return f"not a {kind}"
        err = next(iter(self.validators[kind].iter_errors(msg)), None)
        return None if err is None else f"{'/'.join(map(str, err.absolute_path)) or '(root)'}: {err.message}"

    def drop(self, direction: str, reason: str, raw: str):
        self.counts[f"invalid_{direction}"] += 1
        self.session.write(direction, invalid=reason, raw=raw[:2000])

    async def from_board(self, data: bytes, addr: tuple[str, int]):
        """A datagram from the board: a valid packet goes to every browser; the board's address is remembered."""
        raw = data.decode("utf-8", errors="replace")
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError as e:
            return self.drop("up", f"bad JSON: {e.msg}", raw)
        reason = self.check("packet", msg)
        if reason:
            return self.drop("up", reason, raw)
        if not self.esp32_host:
            self.board = (addr[0], self.esp32_port)
        self.counts["packet"] += 1
        self.session.write("up", msg)
        text = json.dumps({"type": "packet", "packet": msg})
        for ws in list(self.clients):
            try:
                await ws.send_text(text)
            except Exception:  # a browser that went away
                self.clients.discard(ws)

    def from_browser(self, raw: str):
        """A browser message: a valid verdict or command goes to the board as one datagram."""
        try:
            wrapper = json.loads(raw)
        except json.JSONDecodeError as e:
            return self.drop("down", f"bad JSON: {e.msg}", raw)
        kind = wrapper.get("type") if isinstance(wrapper, dict) else None
        if kind not in ("verdict", "command"):
            return self.drop("down", f"unknown type {kind!r}", raw)
        msg = wrapper.get(kind)
        reason = self.check(kind, msg)
        if reason:
            return self.drop("down", reason, raw)
        self.counts[kind] += 1
        self.session.write("down", msg)
        if self.board and self.transport:
            self.transport.sendto(json.dumps(msg, separators=(",", ":")).encode(), self.board)

    def status(self) -> dict:
        return {
            "counts": dict(self.counts),
            "board": f"{self.board[0]}:{self.board[1]}" if self.board else None,
            "browsers": len(self.clients),
            "session": str(self.session.path),
        }


class _Udp(asyncio.DatagramProtocol):
    def __init__(self, bridge: Bridge):
        self.bridge = bridge

    def datagram_received(self, data, addr):
        asyncio.get_running_loop().create_task(self.bridge.from_board(data, addr))


NO_DIST = """<!doctype html><meta charset="utf-8"><title>PdM bridge</title>
<p>The bridge is running, but <code>dist/</code> was not found. Run <code>pnpm build</code> in the repository, then
restart the bridge.</p>"""


def create_app(
    port_udp: int = 4211,
    esp32_host: str | None = None,
    esp32_port: int = 4210,
    session_dir: Path = Path(__file__).resolve().parent / "sessions",
    dist: Path = ROOT / "dist",
    schema_dir: Path = ROOT / "public" / "schema",
) -> FastAPI:
    """The bridge app; `port_udp` is where the board's packets arrive (0 picks a free port, for tests)."""
    session = SessionLog(session_dir / time.strftime("session-%Y%m%d-%H%M%S.jsonl"))
    bridge = Bridge(load_validators(schema_dir), session, esp32_host, esp32_port)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        loop = asyncio.get_running_loop()
        transport, _ = await loop.create_datagram_endpoint(lambda: _Udp(bridge), local_addr=("0.0.0.0", port_udp))
        bridge.transport = transport
        app.state.udp_port = transport.get_extra_info("sockname")[1]
        yield
        transport.close()
        session.close()

    app = FastAPI(title="PdM live bridge", lifespan=lifespan)
    app.state.bridge = bridge

    @app.get("/status")
    def status():
        return {**bridge.status(), "udp_port": getattr(app.state, "udp_port", None)}

    @app.websocket("/ui")
    async def ui(ws: WebSocket):
        await ws.accept()
        bridge.clients.add(ws)
        await ws.send_text(json.dumps({"type": "hello", **bridge.status()}))
        try:
            while True:
                bridge.from_browser(await ws.receive_text())
        except WebSocketDisconnect:
            bridge.clients.discard(ws)

    if (dist / "index.html").exists():
        app.mount("/", StaticFiles(directory=dist, html=True), name="dist")
    else:

        @app.get("/", response_class=HTMLResponse)
        def no_dist():
            return NO_DIST

    return app


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--host", default="0.0.0.0", help="HTTP/WebSocket host (default 0.0.0.0)")
    p.add_argument("--port", type=int, default=8765, help="HTTP/WebSocket port (default 8765)")
    p.add_argument("--udp-port", type=int, default=4211, help="UDP port the board sends packets to (default 4211)")
    p.add_argument("--esp32-host", help="board IP; default: the source of the last packet")
    p.add_argument("--esp32-port", type=int, default=4210, help="UDP port the board listens on (default 4210)")
    p.add_argument("--session-dir", type=Path, default=Path(__file__).resolve().parent / "sessions")
    p.add_argument("--dist", type=Path, default=ROOT / "dist")
    a = p.parse_args()

    import uvicorn

    app = create_app(a.udp_port, a.esp32_host, a.esp32_port, a.session_dir, a.dist)
    print(f"PdM bridge: open http://localhost:{a.port}  (board UDP in :{a.udp_port}, out :{a.esp32_port})", flush=True)
    uvicorn.run(app, host=a.host, port=a.port, log_level="warning")


if __name__ == "__main__":
    main()
