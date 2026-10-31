import { spawn, spawnSync } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const ROOT = join(import.meta.dirname, '../..');

test('P8.2: Live without a bridge says how to run it; M4 and the sim controls are off; E-STOP note shows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__pdm?.modelStatus().status === 'READY', undefined, { timeout: 60_000 });
  await expect(page.getByTestId('sel-mode')).toBeEnabled();
  await page.getByTestId('sel-mode').selectOption('live');
  const banner = page.getByTestId('live-banner');
  await expect(banner).toHaveAttribute('data-status', 'closed', { timeout: 15_000 });
  await expect(banner).toContainText('http://localhost:8765');
  await expect(banner).toContainText('bridge-py/app.py');
  await expect(page.getByTestId('mode-label')).toHaveText('Live · closed');
  await expect(page.getByTestId('sld-imbalance')).toBeDisabled();
  await expect(page.getByTestId('faults-disabled-note')).toBeVisible();
  await expect(page.getByTestId('estop-note')).toContainText('not a safety stop');
  for (const id of ['btn-play', 'sel-speed', 'btn-sim-reset', 'sel-scenario']) await expect(page.getByTestId(id), id).toBeDisabled(); // prettier-ignore
  await page.getByTestId('sel-mode').selectOption('sim');
  await expect(banner).toBeHidden();
  await expect(page.getByTestId('sld-imbalance')).toBeEnabled();
  await expect(page.getByTestId('btn-play')).toBeEnabled();
  await expect(page.getByTestId('mode-label')).toHaveText('Simulation');
});

// With a Python that can run the bridge: the real browser, the bridge serving dist/, and the emulated ESP32.
function python(): string | null {
  for (const exe of [process.env['BRIDGE_PYTHON'], 'python3']) {
    if (exe && spawnSync(exe, ['-c', 'import fastapi, uvicorn, jsonschema, websockets']).status === 0) return exe;
  }
  return null;
}
const PY = python();
const freeTcp = () => new Promise<number>((r) => { const s = createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => r(p)); }); }); // prettier-ignore
const freeUdp = () => new Promise<number>((r) => { const s = createSocket('udp4').bind(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); // prettier-ignore
const badge = (page: Page) => page.getByTestId('status-badge');

test.describe('P8.2 with the bridge and the emulated ESP32', () => {
  test.skip(PY === null, 'no Python with the bridge packages (set BRIDGE_PYTHON)');

  test('START → NORMAL → imbalance → CRITICAL (RCF) → RESET, scored by the browser RCF worker; "—" where the board is silent', async ({
    page,
  }) => {
    // prettier-ignore
    test.setTimeout(150_000);
    const [http, udpIn, udpBoard] = [await freeTcp(), await freeUdp(), await freeUdp()];
    const dir = mkdtempSync(join(tmpdir(), 'pdm-live-'));
    const bridge = spawn(PY as string, ['bridge-py/app.py', '--host', '127.0.0.1', '--port', String(http), '--udp-port', String(udpIn), '--esp32-host', '127.0.0.1', '--esp32-port', String(udpBoard), '--session-dir', dir], { cwd: ROOT }); // prettier-ignore
    const fake = spawn(PY as string, ['bridge-py/fake_esp32.py', '--bridge-port', String(udpIn), '--listen-port', String(udpBoard), '--speed', '4', '--fault', 'imbalance_g=0.3@60'], { cwd: ROOT }); // prettier-ignore
    try {
      await expect.poll(async () => (await fetch(`http://127.0.0.1:${http}/status`).catch(() => null))?.ok, { timeout: 20_000 }).toBe(true); // prettier-ignore
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(`http://127.0.0.1:${http}/?debug=1`);
      await page.waitForFunction(() => window.__pdm?.modelStatus().status === 'READY', undefined, { timeout: 60_000 });
      await page.getByTestId('sel-mode').selectOption('live');
      await expect(page.getByTestId('live-banner')).toHaveAttribute('data-status', 'open', { timeout: 15_000 });
      await expect(badge(page)).toHaveText('OFF', { timeout: 15_000 });
      await page.getByTestId('btn-start').click();
      await expect(badge(page)).toHaveText('NORMAL', { timeout: 30_000 });
      await expect(page.getByTestId('rpm-readout')).toHaveText(/^3[78]\d\d rpm$/);
      await expect(page.getByTestId('persistence')).toHaveText('—/5');
      await page.evaluate(() => window.__pdm?.select('fan'));
      await expect(page.getByTestId('inspector-pin').first()).toHaveText('red +— V, — A');
      await expect(badge(page)).toHaveText('CRITICAL', { timeout: 40_000 });
      await expect(page.getByTestId('trip-reason')).toHaveText('RCF');
      await expect(page.getByTestId('dominant-var')).toHaveText('a_rms_g');
      await expect(page.getByTestId('relay-state')).toHaveText('CH2 open');
      await expect.poll(async () => Number((await page.getByTestId('rpm-readout').textContent())?.split(' ')[0]), { timeout: 30_000 }).toBeLessThan(100); // prettier-ignore
      await page.getByTestId('btn-reset').click();
      await page.getByTestId('btn-reset-confirm').click();
      await expect(badge(page)).toHaveText('OFF', { timeout: 15_000 });
      const st = (await (await fetch(`http://127.0.0.1:${http}/status`)).json()) as { counts: Record<string, number> };
      expect(st.counts).toMatchObject({ command: 2, invalid_up: 0, invalid_down: 0 });
      expect(st.counts['verdict']).toBeGreaterThan(60);
    } finally {
      fake.kill();
      bridge.kill();
    }
  });
});
