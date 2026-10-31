import { expect, type Page, test } from '@playwright/test';

const IDS = ['status-badge', 'rcf-gauge', 'dominant-var', 'persistence', 'relay-state', 'rpm-readout', 'link-indicator', 'sensor-indicator', 'trip-reason']; // prettier-ignore

async function open(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__sim !== undefined && window.__pdm?.modelStatus().status === 'READY');
}

test('M3: every readout exists and shows the OFF state', async ({ page }) => {
  await open(page);
  for (const id of IDS) await expect(page.getByTestId(id), id).toBeVisible();
  await expect(page.getByTestId('status-badge')).toHaveText('OFF');
  await expect(page.getByTestId('status-badge')).toHaveAttribute('data-tone', 'grey');
  await expect(page.getByTestId('relay-state')).toHaveText('CH2 open');
  await expect(page.getByTestId('persistence')).toHaveText('0/5');
  await expect(page.getByTestId('trip-reason')).toHaveText('—');
  await expect(page.getByTestId('link-indicator')).toHaveAttribute('data-ok', 'true');
  await expect(page.getByTestId('sensor-indicator')).toHaveAttribute('data-ok', 'true');
});

test('M3 follows the sim: NORMAL with a score, then ESTOP → CRITICAL with its trip reason', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await page.evaluate(() => {
    window.__pdm?.setSpeed(4);
    window.__pdm?.command('START');
    window.__pdm?.play();
  });
  await page.waitForFunction(() => window.__sim?.state === 'NORMAL', undefined, { timeout: 60_000 });
  await page.waitForFunction(() => (window.__pdm?.rcfVerdicts().filter((v) => v.score !== null).length ?? 0) > 1);
  await expect(page.getByTestId('status-badge')).toHaveText('NORMAL');
  await expect(page.getByTestId('status-badge')).toHaveAttribute('data-tone', 'green');
  await expect(page.getByTestId('relay-state')).toHaveText('CH2 NO closed');
  await expect(page.getByTestId('rcf-gauge')).toHaveText(/^0\.\d\d \/ 0\.50$/);
  await expect(page.getByTestId('dominant-var')).not.toHaveText('—');
  await expect(page.getByTestId('rpm-readout')).toHaveText(/^3[78]\d\d rpm$/);
  await page.evaluate(() => window.__pdm?.command('ESTOP'));
  await expect(page.getByTestId('status-badge')).toHaveText('CRITICAL');
  await expect(page.getByTestId('status-badge')).toHaveAttribute('data-tone', 'red');
  await expect(page.getByTestId('trip-reason')).toHaveText('ESTOP');
  await expect(page.getByTestId('relay-state')).toHaveText('CH2 open');
});
