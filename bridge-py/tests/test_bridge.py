"""Bridge tests (P8.1): validation, counting, relaying in both directions, the session log, dist/ serving."""
import json
import socket
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import create_app  # noqa: E402

PACKET = {
    "v": 1, "kind": "packet", "seq": 7, "ts_ms": 8000, "win_ms": 1000, "a_rms_g": 0.12, "cf": 2.5, "i_rms_A": 0.18,
    "t_C": 34.06, "dtdt_C_per_min": 0.0, "rpm": 3810, "state": "NORMAL", "relay_ch2": "ON", "link_lost": False,
    "sensor_fault": False, "warn_reason": None, "trip_reason": None,
}
VERDICT = {
    "v": 1, "kind": "verdict", "seq_ref": 7, "score": 0.21, "threshold": 0.5, "alert": False, "clear": True,
    "dominant": "cf", "z": {"cf": 1.2}, "model": "READY",
}
COMMAND = {"v": 1, "kind": "command", "seq": 0, "cmd": "START"}


@pytest.fixture
def board():
    """A UDP socket standing in for the ESP32's port 4210."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind(("127.0.0.1", 0))
    s.settimeout(2)
    yield s
    s.close()


@pytest.fixture
def bridge(tmp_path, board):
    app = create_app(port_udp=0, esp32_host="127.0.0.1", esp32_port=board.getsockname()[1],
                     session_dir=tmp_path / "sessions", dist=tmp_path / "no-dist")
    with TestClient(app) as client:
        yield client, app


def send_up(client, payload: bytes):
    port = client.get("/status").json()["udp_port"]
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.sendto(payload, ("127.0.0.1", port))


def counts(client):
    return client.get("/status").json()["counts"]


def wait_for(cond, timeout=2.0):
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        if cond():
            return True
        time.sleep(0.01)
    return False


def test_packets_from_the_board_reach_every_browser(bridge):
    client, _ = bridge
    with client.websocket_connect("/ui") as ws:
        hello = json.loads(ws.receive_text())
        assert hello["type"] == "hello" and hello["counts"]["packet"] == 0
        send_up(client, json.dumps(PACKET).encode())
        assert json.loads(ws.receive_text()) == {"type": "packet", "packet": PACKET}
    assert counts(client)["packet"] == 1


@pytest.mark.parametrize("bad", [
    b"not json",
    json.dumps({**PACKET, "state": "BROKEN"}).encode(),
    json.dumps({k: v for k, v in PACKET.items() if k != "rpm"}).encode(),
    json.dumps({**PACKET, "seq": -1}).encode(),
    json.dumps(VERDICT).encode(),  # the board sends packets only
])
def test_invalid_datagrams_are_dropped_and_counted(bridge, bad):
    client, _ = bridge
    send_up(client, bad)
    assert wait_for(lambda: counts(client)["invalid_up"] == 1)
    send_up(client, json.dumps(PACKET).encode())  # a valid one still goes through afterwards
    assert wait_for(lambda: counts(client)["packet"] == 1)
    assert counts(client)["invalid_up"] == 1


def test_verdicts_and_commands_from_the_browser_reach_the_board(bridge, board):
    client, _ = bridge
    with client.websocket_connect("/ui") as ws:
        ws.receive_text()
        ws.send_text(json.dumps({"type": "verdict", "verdict": VERDICT}))
        assert json.loads(board.recv(4096)) == VERDICT
        ws.send_text(json.dumps({"type": "command", "command": COMMAND}))
        assert json.loads(board.recv(4096)) == COMMAND
        for bad in ["{", json.dumps({"type": "verdict", "verdict": {**VERDICT, "score": "high"}}),
                    json.dumps({"type": "hack", "x": 1}), json.dumps({"type": "command", "command": {**COMMAND, "cmd": "BOOM"}})]:  # noqa: E501
            ws.send_text(bad)
        assert wait_for(lambda: counts(client)["invalid_down"] == 4)
    c = counts(client)
    assert (c["verdict"], c["command"]) == (1, 1)
    board.settimeout(0.2)
    with pytest.raises(socket.timeout):
        board.recv(4096)  # nothing invalid reached the board


def test_session_file_logs_every_message_and_every_drop(bridge, tmp_path):
    client, app = bridge
    with client.websocket_connect("/ui") as ws:
        ws.receive_text()
        send_up(client, json.dumps(PACKET).encode())
        ws.receive_text()
        ws.send_text(json.dumps({"type": "verdict", "verdict": VERDICT}))
        send_up(client, b"garbage")
        assert wait_for(lambda: counts(client)["invalid_up"] == 1 and counts(client)["verdict"] == 1)
    path = Path(client.get("/status").json()["session"])
    lines = [json.loads(line) for line in path.read_text().splitlines()]
    assert [line["dir"] for line in lines] == ["up", "down", "up"]
    assert lines[0]["msg"] == PACKET and lines[1]["msg"] == VERDICT
    assert lines[2]["invalid"].startswith("bad JSON") and lines[2]["raw"] == "garbage"
    assert all(isinstance(line["t_ms"], (int, float)) for line in lines)


def test_learns_the_board_address_from_its_packets(tmp_path, board):
    app = create_app(port_udp=0, esp32_host=None, esp32_port=board.getsockname()[1],
                     session_dir=tmp_path / "s", dist=tmp_path / "no-dist")
    with TestClient(app) as client:
        assert client.get("/status").json()["board"] is None
        send_up(client, json.dumps(PACKET).encode())
        assert wait_for(lambda: client.get("/status").json()["board"] == f"127.0.0.1:{board.getsockname()[1]}")
        with client.websocket_connect("/ui") as ws:
            ws.receive_text()
            ws.send_text(json.dumps({"type": "command", "command": COMMAND}))
            assert json.loads(board.recv(4096))["cmd"] == "START"


def test_serves_dist_or_says_how_to_build_it(tmp_path):
    no = TestClient(create_app(port_udp=0, session_dir=tmp_path / "a", dist=tmp_path / "missing"))
    assert "pnpm build" in no.get("/").text
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>PdM</title>")
    yes = TestClient(create_app(port_udp=0, session_dir=tmp_path / "b", dist=dist))
    assert "<title>PdM</title>" in yes.get("/").text
