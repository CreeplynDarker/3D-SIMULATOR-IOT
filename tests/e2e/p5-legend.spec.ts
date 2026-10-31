import { expect, type Page, test } from '@playwright/test';

async function open(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__sim !== undefined && window.__pdm?.modelStatus().status === 'READY');
}
const view = (page: Page) => page.evaluate(() => window.__pdm?.inspect());

test('M12: btn-help opens the legend with wire colours, state colours, shortcuts and the glossary', async ({
  page,
}) => {
  await open(page);
  await page.getByTestId('btn-help').click();
  const modal = page.getByTestId('legend-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByTestId('legend-wire')).toHaveCount(11);
  await expect(modal.getByTestId('legend-state')).toHaveCount(6);
  await expect(modal).toContainText('Space');
  await expect(modal).toContainText('CoDisp');
  await expect(modal).toContainText('Latched');
  await page.getByTestId('btn-legend-close').click();
  await expect(modal).toBeHidden();
  await page.keyboard.press('?');
  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});

test('keyboard: Space, S, E, R and 1–5 drive the app; keys typed into inputs are ignored', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  await page.getByTestId('sel-speed').selectOption('4');
  await page.locator('body').click({ position: { x: 5, y: 60 } });
  await page.keyboard.press('2');
  expect((await view(page))?.ui.camera).toBe('fan');
  await page.keyboard.press('1');
  expect((await view(page))?.ui.camera).toBe('overview');
  await page.keyboard.press('s');
  await page.keyboard.press(' ');
  expect((await view(page))?.sim.playing).toBe(true);
  await page.waitForFunction(() => window.__sim?.state === 'NORMAL', undefined, { timeout: 60_000 });
  await page.getByTestId('inp-ramp-s').focus();
  await page.keyboard.press('e');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__sim?.state)).toBe('NORMAL');
  await page.locator('body').click({ position: { x: 5, y: 60 } });
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__sim?.state === 'CRITICAL');
  await page.keyboard.press('r');
  await expect(page.getByTestId('dlg-reset-confirm')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dlg-reset-confirm')).toBeHidden();
});
