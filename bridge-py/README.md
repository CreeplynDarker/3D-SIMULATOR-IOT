# Live bridge (P8)

Connects the ESP32 to the simulator UI. The board sends one JSON packet per second over UDP to this laptop's
port **4211**, and listens for verdicts and commands on its own port **4210**. The browser talks to the bridge over
a WebSocket at `/ui`. The bridge validates every message against `public/schema/*.schema.json`, drops and counts
invalid ones, and logs everything to `bridge-py/sessions/session-*.jsonl`, which the UI can replay. Scoring stays
in the browser's RCF worker: the bridge never decides anything. It also serves the built app at
**http://localhost:8765**, so the page and its WebSocket share one origin.

## Setup (once)

Needs Python 3.11 or newer, plus Node 22 and pnpm for building the app and for the emulated board.

Linux / macOS:

```bash
python3 -m venv bridge-py/.venv
```

```bash
bridge-py/.venv/bin/pip install -r bridge-py/requirements-dev.txt
```

Windows (PowerShell):

```powershell
py -3 -m venv bridge-py\.venv
```

```powershell
bridge-py\.venv\Scripts\pip install -r bridge-py\requirements-dev.txt
```

Then build the app the bridge serves:

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm build
```

## Run

Linux / macOS:

```bash
bridge-py/.venv/bin/python bridge-py/app.py
```

Windows:

```powershell
bridge-py\.venv\Scripts\python bridge-py\app.py
```

Open http://localhost:8765 and choose **Mode: Live**. Options: `--port 8765`, `--udp-port 4211`,
`--esp32-port 4210` and `--esp32-host <board IP>`; without the last one, the bridge answers to whichever address the
packets come from. `GET /status` shows the message counts, the invalid ones, and the session file in use.

Allow inbound UDP 4211 through the laptop's firewall (on Windows, the first run asks).

## Without a board: the emulated ESP32

`fake_esp32.py` speaks the board's UDP protocol and runs the simulator's real plant and firmware
(`scripts/esp32-emulator.ts`). So START, RESET, E-STOP and the RCF verdicts drive the real state machine.

```bash
bridge-py/.venv/bin/python bridge-py/fake_esp32.py --speed 1 --fault imbalance_g=0.3@60
```

`--speed` sets sim seconds per wall second; `--fault key=value@t_s` injects a fault at a sim time (repeat it for
more). `--replay <session.jsonl>` re-sends a recorded session's packets instead (no reaction to commands). The board
side prints a timestamped log of every packet it sends and every verdict and command it receives.

## Tests

```bash
bridge-py/.venv/bin/python -m pytest -q bridge-py/tests
```

The repo's Vitest suite also runs these, together with an end-to-end run of the fake board through the bridge,
whenever it finds a Python with these packages (set `BRIDGE_PYTHON=bridge-py/.venv/bin/python`). Without one, those
tests are skipped.
