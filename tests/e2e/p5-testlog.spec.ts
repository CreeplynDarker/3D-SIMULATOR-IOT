import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('M10: a run over S2 records the alert, the relay delay, the operator reset and notes; it exports', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__sim !== undefined && window.__pdm?.modelStatus().status === 'READY');
  await page.getByTestId('dock-tab-testlog').click();
  for (const id of ['testlog-table', 'btn-run-start', 'btn-run-stop', 'inp-run-notes', 'btn-testlog-export']) await expect(page.getByTestId(id), id).toBeVisible(); // prettier-ignore
  await page.getByTestId('sel-speed').selectOption('10');
  await page.getByTestId('sel-scenario').selectOption('S2');
  await page.getByTestId('btn-run-start').click();
  await expect(page.getByTestId('btn-run-start')).toBeDisabled();
  await page.waitForFunction(() => window.__sim?.scenarioDone === true, undefined, { timeout: 120_000 });
  // S2 ends at 120 s, well after the fan has stopped: RESET through the dialog is accepted.
  await page.getByTestId('btn-reset').click();
  await page.getByTestId('btn-reset-confirm').click();
  await page.getByTestId('btn-play').click();
  await page.waitForFunction(() => window.__sim?.state === 'OFF');
  await page.getByTestId('inp-run-notes').fill('imbalance 0.3 g, trip on RCF');
  await page.getByTestId('btn-run-stop').click();
  const run = (await page.evaluate(() => window.__pdm?.inspect().testlog))?.runs[0];
  expect(run).toMatchObject({
    scenario: 'S2',
    alerted: true,
    resetByOperator: true,
    notes: 'imbalance 0.3 g, trip on RCF',
  });
  // Time to first alert counts from the run's start; the S2 alert itself comes at 60–63 s of sim time.
  const alertAt_s = (run?.start_s ?? 0) + (run?.firstAlert_s ?? 0);
  expect(alertAt_s).toBeGreaterThan(60);
  expect(alertAt_s).toBeLessThanOrEqual(63);
  expect(run?.criticalToRelay_ms ?? 99).toBeLessThanOrEqual(20);
  expect((run?.start_s ?? 0) + (run?.duration_s ?? 0)).toBeGreaterThan(120);
  await expect(page.getByTestId('testlog-row')).toHaveCount(1);
  await expect(page.getByTestId('testlog-row')).toContainText('S2');
  const dl = page.waitForEvent('download');
  await page.getByTestId('btn-testlog-export').click();
  const csv = readFileSync((await (await dl).path()) ?? '', 'utf8')
    .trimEnd()
    .split('\n');
  expect(csv).toHaveLength(2);
  expect(csv[1]).toMatch(/^S2,\d+\.\d,\d+\.\d,y,\d+\.\d\d,\d+\.\d,y,"imbalance 0\.3 g, trip on RCF"$/);
});
