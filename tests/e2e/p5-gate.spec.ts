import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// P5.G phase gate (spec §11): driven through the real buttons and sliders; window.__pdm / __sim are only used to
// wait for states and to read event times.
test('P5.G: imbalance 0.3 trips on RCF within 15 s of sim time; reset with confirm → OFF; CSV rows = console packets', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__sim !== undefined);
  await expect(page.getByTestId('model-status')).toHaveText('READY', { timeout: 30_000 });
  await page.getByTestId('sel-speed').selectOption('4');
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('status-badge')).toHaveText('NORMAL', { timeout: 60_000 });

  await page.getByTestId('sld-imbalance').fill('0.3');
  await expect(page.getByTestId('status-badge')).toHaveText('CRITICAL', { timeout: 60_000 });
  const tBadge_s = await page.evaluate(() => window.__sim?.t_s ?? NaN);
  const events = await page.evaluate(() => window.__pdm?.events() ?? []);
  const tFault_s = events.find((e) => e.type === 'FAULT_SET' && e.detail?.startsWith('imbalance_g'))?.t_s ?? NaN;
  const tCritical_s = events.find((e) => e.type === 'CRITICAL')?.t_s ?? NaN;
  process.stdout.write(`GATE fault=${tFault_s.toFixed(3)} critical=${tCritical_s.toFixed(3)} badge=${tBadge_s.toFixed(3)} delta=${(tCritical_s - tFault_s).toFixed(3)}\n`); // prettier-ignore
  expect(tCritical_s - tFault_s).toBeLessThanOrEqual(15);
  expect(tBadge_s - tFault_s).toBeLessThanOrEqual(15 + 0.5); // the badge shows it at the next snapshot
  await expect(page.getByTestId('trip-reason')).toHaveText('RCF');
  await expect(page.getByTestId('btn-reset')).toBeEnabled();

  // The firmware accepts RESET once the fan is below 100 rpm.
  await page.waitForFunction(() => (window.__pdm?.snapshot()?.rpm ?? 1e9) < 100, undefined, { timeout: 60_000 });
  await page.getByTestId('btn-reset').click();
  await expect(page.getByTestId('dlg-reset-confirm')).toBeVisible();
  await page.getByTestId('btn-reset-confirm').click();
  await expect(page.getByTestId('status-badge')).toHaveText('OFF', { timeout: 10_000 });

  await page.getByTestId('btn-play').click(); // pause, so the console holds still for the export
  await page.getByTestId('dock-tab-console').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('btn-export-csv').click();
  const rows = readFileSync((await (await dl).path()) ?? '', 'utf8')
    .trimEnd()
    .split('\n')
    .slice(1);
  const consolePackets = (await page.evaluate(() => window.__pdm?.inspect().console))?.packets ?? -1;
  process.stdout.write(`GATE csvRows=${rows.length} consolePackets=${consolePackets}\n`);
  expect(rows.length).toBe(consolePackets);
  expect(rows.length).toBeGreaterThan(20);
  for (const r of rows) expect(r.split(',')).toHaveLength(22);
});
