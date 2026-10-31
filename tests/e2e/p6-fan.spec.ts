import { expect, type Page, test } from '@playwright/test';

async function running(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => (window.__scene?.frames() ?? 0) > 5 && window.__pdm?.modelStatus().status === 'READY', undefined, { timeout: 60_000 }); // prettier-ignore
  for (const t of ['flow', 'labels', 'airflow', 'heat'] as const) {
    if (!(await page.evaluate((k) => window.__pdm?.inspect().ui.toggles[k], t)))
      await page.getByTestId(`tgl-${t}`).click();
  }
  await page.getByTestId('sel-speed').selectOption('4');
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-play').click();
  await page.waitForFunction(() => window.__sim?.state === 'NORMAL', undefined, { timeout: 60_000 });
}
const fan = (page: Page) => page.evaluate(() => window.__scene?.anim().fan);

test('P6: with the sim paused, two screenshots 1 s apart are identical', async ({ page }) => {
  test.setTimeout(120_000);
  await running(page);
  await page.getByTestId('sld-imbalance').fill('0.3');
  await page.waitForFunction(() => (window.__sim?.t_s ?? 0) > 16);
  await page.getByTestId('btn-play').click();
  await page.waitForTimeout(500); // the last snapshot and its frames
  const a = await page.getByTestId('viewport').screenshot();
  await page.waitForTimeout(1000);
  const b = await page.getByTestId('viewport').screenshot();
  expect(b.equals(a)).toBe(true);
});

test('P6.1: blades crossfade to the blur disc above bladeBlurRpm; the frame jitters with a_RMS, capped', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => (window.__scene?.frames() ?? 0) > 5);
  expect(await fan(page)).toMatchObject({ discOpacity: 0, bladeOpacity: 1 });
  await running(page);
  await expect.poll(async () => (await fan(page))?.discOpacity).toBeGreaterThan(0.6);
  expect((await fan(page))?.bladeOpacity).toBeLessThan(0.1);
  const healthy = (await fan(page))?.jitterAmp_mm ?? -1;
  expect(healthy).toBeGreaterThan(0);
  await page.getByTestId('inp-threshold').fill('1'); // no RCF trip, so the fan keeps turning with the imbalance
  await page.getByTestId('sld-imbalance').fill('0.3');
  await expect.poll(async () => (await fan(page))?.jitterAmp_mm ?? 0, { timeout: 20_000 }).toBeGreaterThan(healthy * 3);
  await page.getByTestId('sld-vib-exaggeration').fill('50');
  await expect.poll(async () => (await fan(page))?.jitterAmp_mm).toBe(4);
});

test('P6.1: "slowed for visibility" shows with the Fan camera or the fan selected', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__pdm !== undefined);
  const label = page.getByTestId('vib-slowed-label');
  await expect(label).toBeHidden();
  await page.getByTestId('cam-fan').click();
  await expect(label).toBeVisible();
  await expect(label).toHaveText(/slowed for visibility/);
  await page.getByTestId('cam-overview').click();
  await expect(label).toBeHidden();
  await page.evaluate(() => window.__pdm?.select('fan'));
  await expect(label).toBeVisible();
});
