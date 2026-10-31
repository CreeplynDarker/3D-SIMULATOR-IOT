import { expect, test } from '@playwright/test';

test('M9: shows the selected component with its photo, specs, live pins and wires', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__sim !== undefined && window.__pdm?.modelStatus().status === 'READY');
  const inspector = page.getByTestId('inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText('Click a part');
  await page.evaluate(() => window.__pdm?.select('acs712'));
  await expect(inspector).toContainText('ACS712 current module (5 A)');
  await expect(inspector.locator('img')).toHaveAttribute('src', /acs712-pcb\.jpg$/);
  await expect(inspector).toContainText('W25');
  await page.evaluate(() => {
    window.__pdm?.setSpeed(4);
    window.__pdm?.command('START');
    window.__pdm?.play();
  });
  await page.waitForFunction(() => window.__sim?.state === 'NORMAL', undefined, { timeout: 60_000 });
  await expect(inspector.getByTestId('inspector-pin').first()).toHaveText(
    /^ACS712 OUT \d\.\d{3} V → GPIO34 \d+ counts$/,
  );
  const a = await inspector.getByTestId('inspector-pin').first().textContent();
  await expect.poll(() => inspector.getByTestId('inspector-pin').first().textContent()).not.toBe(a);
  await page.evaluate(() => window.__pdm?.select('relay'));
  await expect(inspector).toContainText('COM2 → NO2 closed');
});
