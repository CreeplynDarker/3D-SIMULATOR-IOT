import { expect, type Page, test } from '@playwright/test';

async function running(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => (window.__scene?.frames() ?? 0) > 5 && window.__pdm?.modelStatus().status === 'READY', undefined, { timeout: 60_000 }); // prettier-ignore
  await page.getByTestId('sel-speed').selectOption('10');
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-play').click();
  await page.waitForFunction(() => window.__sim?.state === 'NORMAL', undefined, { timeout: 60_000 });
}
const fan = (page: Page) => page.evaluate(() => window.__scene?.anim().fan);
const sound = (page: Page) => page.evaluate(() => window.__scene?.anim().sound);
const red = (hex: string) => parseInt(hex.slice(1, 3), 16);

test('P6.4: with tgl-heat the hub tint follows the motor temperature (blue 25 °C → red 70 °C)', async ({ page }) => {
  test.setTimeout(150_000);
  await running(page);
  expect((await fan(page))?.hubColor).toBe('#ffffff');
  await page.getByTestId('tgl-heat').click();
  await expect.poll(async () => (await fan(page))?.hubColor).not.toBe('#ffffff');
  const warm = (await fan(page))?.hubColor ?? '#000000';
  await page.getByTestId('inp-threshold').fill('1'); // no RCF trip, so the motor can heat up
  await page.getByTestId('sld-overheat').fill('1');
  await expect.poll(async () => red((await fan(page))?.hubColor ?? '#000000'), { timeout: 90_000 }).toBeGreaterThan(red(warm) + 30); // prettier-ignore
});

test('P6.4: the hum is muted by default; with sound on its pitch follows rpm and it falls silent when paused', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await running(page);
  expect((await sound(page))?.on).toBe(false);
  await page.getByTestId('tgl-sound').click();
  await expect.poll(async () => (await sound(page))?.gain ?? 0).toBeGreaterThan(0);
  expect((await sound(page))?.freq_Hz).toBeGreaterThan(400);
  expect((await sound(page))?.freq_Hz).toBeLessThan(470);
  await page.getByTestId('btn-play').click();
  await expect.poll(async () => (await sound(page))?.gain).toBe(0);
});
