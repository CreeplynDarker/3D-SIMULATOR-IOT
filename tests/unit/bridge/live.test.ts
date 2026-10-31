// P8.1 integration: the bridge (bridge-py/app.py), the emulated ESP32 (bridge-py/fake_esp32.py, real TS firmware) and
// a stand-in browser that scores every packet with the real RCF service and default model, over the real UDP and
// WebSocket links. It runs only when a Python with the bridge's packages is found (BRIDGE_PYTHON, else python3).
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createRcfService } from '../../../src/rcf/service.ts';
import { CONFIG } from '../../../src/shared/config.ts';
import { type Packet, PROTOCOL_VERSION, type Verdict } from '../../../src/shared/protocol.ts';

const ROOT = join(import.meta.dirname, '../../..');

/** A Python that can run the bridge, or null. */
function python(): string | null {
  for (const exe of [process.env['BRIDGE_PYTHON'], 'python3']) {
    if (!exe) continue;
    const r = spawnSync(exe, ['-c', 'import fastapi, uvicorn, jsonschema, websockets']);
    if (r.status === 0) return exe;
  }
  return null;
}
const PY = python();

const freeTcp = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
const freeUdp = () =>
  new Promise<number>((resolve) => {
    const s = createSocket('udp4').bind(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
const until = async (cond: () => boolean, timeout_ms: number, what: string) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeout_ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

const children: ChildProcess[] = [];
afterAll(() => children.forEach((c) => c.kill()));

describe.skipIf(PY === null)('live bridge with the emulated ESP32 (P8.1)', () => {
  it('runs START → NORMAL → imbalance → CRITICAL (RCF) → RESET through the bridge, with the browser RCF verdicts', async () => {
    const [http, udpIn, udpBoard] = [await freeTcp(), await freeUdp(), await freeUdp()];
    const dir = mkdtempSync(join(tmpdir(), 'pdm-bridge-'));
    const bridge = spawn(PY as string, ['bridge-py/app.py', '--host', '127.0.0.1', '--port', String(http), '--udp-port', String(udpIn), '--esp32-host', '127.0.0.1', '--esp32-port', String(udpBoard), '--session-dir', dir, '--dist', join(dir, 'no-dist')], { cwd: ROOT }); // prettier-ignore
    children.push(bridge);
    const status = async () => (await (await fetch(`http://127.0.0.1:${http}/status`)).json()) as { counts: Record<string, number>; session: string }; // prettier-ignore
    await until(() => false, 0, '').catch(() => undefined);
    for (let k = 0; ; k++) {
      try {
        await status();
        break;
      } catch {
        if (k > 100) throw new Error('bridge did not start');
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    const fake = spawn(PY as string, ['bridge-py/fake_esp32.py', '--bridge-port', String(udpIn), '--listen-port', String(udpBoard), '--speed', '10', '--fault', 'imbalance_g=0.3@60'], { cwd: ROOT }); // prettier-ignore
    children.push(fake);
    let runLog = '';
    fake.stdout.on('data', (d: Buffer) => (runLog += d.toString()));

    // The stand-in browser: the same RCF service and default model as the app's RCF worker.
    const rcf = createRcfService(CONFIG);
    rcf.load(readFileSync(join(ROOT, 'public/models/default-model.json'), 'utf8'));
    const packets: Packet[] = [];
    const verdicts: Verdict[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${http}/ui`);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(String(e.data)) as { type: string; packet?: Packet };
      if (m.type !== 'packet' || !m.packet) return;
      packets.push(m.packet);
      const { verdict } = rcf.packet(m.packet);
      verdicts.push(verdict);
      ws.send(JSON.stringify({ type: 'verdict', verdict }));
    });
    let seq = 0;
    const command = (cmd: 'START' | 'RESET') => ws.send(JSON.stringify({ type: 'command', command: { v: PROTOCOL_VERSION, kind: 'command', seq: seq++, cmd } })); // prettier-ignore
    const last = () => packets.at(-1);

    await until(() => packets.length > 2 && last()?.state === 'OFF', 15_000, 'packets in OFF');
    command('START');
    await until(() => last()?.state === 'NORMAL', 15_000, 'NORMAL');
    await until(() => last()?.state === 'CRITICAL', 20_000, 'CRITICAL');
    const crit = last() as Packet;
    await until(() => (last()?.rpm ?? 1e9) < 100, 15_000, 'the fan to stop');
    command('RESET');
    await until(() => last()?.state === 'OFF', 10_000, 'OFF after RESET');
    ws.send('{"type":"verdict","verdict":{"kind":"verdict"}}'); // invalid: dropped and counted
    await until(() => false, 300, '').catch(() => undefined);
    const st = await status();
    ws.close();
    writeFileSync(join(dir, 'fake-esp32-run.log'), runLog);
    process.stdout.write(`FAKE_RUN_LOG ${join(dir, 'fake-esp32-run.log')}\n`);

    expect(crit.trip_reason).toBe('RCF');
    expect(crit.ts_ms / 1000).toBeGreaterThan(60);
    expect(crit.ts_ms / 1000).toBeLessThanOrEqual(70);
    const alerts = verdicts.filter((v) => v.alert);
    expect(alerts.length).toBeGreaterThanOrEqual(CONFIG.firmware.nCritical);
    expect(alerts[0]?.dominant).toBe('a_rms_g');
    expect(packets.filter((p) => p.state === 'NORMAL' && p.ts_ms < 60_000).every((p) => !p.link_lost)).toBe(true);
    expect(st.counts).toMatchObject({ command: 2, invalid_up: 0, invalid_down: 1 });
    expect(st.counts['packet']).toBe(packets.length);
    expect(st.counts['verdict']).toBeGreaterThan(50);
    expect(runLog).toMatch(/\* CRITICAL \(sm\.warn\.trip\)/);
    expect(runLog).toMatch(/↓ command RESET/);
    const session = readFileSync(st.session, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { dir: string });
    expect(session.filter((l) => l.dir === 'up').length).toBe(packets.length);
  }, 90_000);

  it('the bridge pytest suite passes', () => {
    const r = spawnSync(PY as string, ['-m', 'pytest', '-q', 'bridge-py/tests'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  }, 60_000);
});
