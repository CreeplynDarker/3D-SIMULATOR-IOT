import { expect, test } from '@playwright/test';

test('the bench scene renders with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./?debug=1');
  const canvas = page.getByTestId('viewport').locator('canvas');
  await expect(canvas).toBeVisible();
  // wait until the scene has drawn a few frames with its photo textures loaded
  await page.waitForFunction(() => (window.__scene?.frames() ?? 0) > 10 && window.__scene?.texturesReady() === true);
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(400);
  expect(errors).toEqual([]);
});
