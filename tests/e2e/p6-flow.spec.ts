import { expect, type Page, test } from '@playwright/test';

async function running(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => (window.__scene?.frames() ?? 0) > 5 && window.__pdm?.modelStatus().status === 'READY', undefined, { timeout: 60_000 }); // prettier-ignore
  await page.getByTestId('sel-speed').selectOption('4');
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-play').click();
  await page.waitForFunction(() => window.__sim?.state === 'NORMAL', undefined, { timeout: 60_000 });
}
const anim = (page: Page) => page.evaluate(() => window.__scene?.anim());

test('P6.2: power nets glow, W04 is live with the relay closed; data pulses and Wi-Fi pulses follow traffic', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await running(page);
  const a = await anim(page);
  expect(a?.flow.wires['W02']).toEqual({ energised: true, glow: true });
  expect(a?.flow.wires['W04']).toEqual({ energised: true, glow: true });
  expect(a?.flow.wires['W05']).toEqual({ energised: true, glow: false }); // GND: live, no glow
  expect(a?.flow.pulses).toBeGreaterThan(0);
  const packets = a?.wifi.packets ?? 0;
  await expect.poll(async () => (await anim(page))?.wifi.packets ?? 0).toBeGreaterThan(packets + 2);
  await expect.poll(async () => (await anim(page))?.wifi.up ?? null, { intervals: [50] }).not.toBeNull();
  await expect.poll(async () => (await anim(page))?.wifi.down ?? null, { intervals: [50] }).not.toBeNull();
  expect((await anim(page))?.wifi.flash).toBe(0);
  const reads = (await page.evaluate(() => window.__pdm?.snapshot()?.traffic.dsReads)) ?? 0;
  await expect.poll(async () => (await page.evaluate(() => window.__pdm?.snapshot()?.traffic.dsReads)) ?? 0).toBeGreaterThan(reads); // prettier-ignore
});

test('P6.2: a dropped packet flashes the Wi-Fi arc red; tgl-flow off stops glow and pulses', async ({ page }) => {
  test.setTimeout(120_000);
  await running(page);
  await page.getByTestId('sld-loss').fill('1');
  await expect.poll(async () => (await anim(page))?.wifi.dropped ?? 0).toBeGreaterThan(1);
  await expect.poll(async () => (await anim(page))?.wifi.flash ?? 0, { intervals: [50] }).toBeGreaterThan(0);
  const sent = (await anim(page))?.wifi.packets;
  await page.waitForFunction((n) => (window.__scene?.anim().wifi.dropped ?? 0) > n + 1, (await anim(page))?.wifi.dropped ?? 0); // prettier-ignore
  expect((await anim(page))?.wifi.packets).toBe(sent);
  await page.getByTestId('tgl-flow').click();
  await expect.poll(async () => (await anim(page))?.flow.pulses).toBe(0);
  expect((await anim(page))?.flow.wires['W02']).toEqual({ energised: true, glow: false });
});

test('P6.2: tgl-labels shows the name tags; hovering a part shows its live value', async ({ page }) => {
  test.setTimeout(90_000);
  await running(page);
  expect((await anim(page))?.labels).toBe(10);
  await page.getByTestId('tgl-labels').click();
  await expect.poll(async () => (await anim(page))?.labels).toBe(0);
  await page.getByTestId('btn-play').click(); // pause so the fan holds still under the pointer
  await page.getByTestId('cam-fan').click();
  await page.waitForFunction(() => window.__scene?.cameraMoving() === false);
  const p = await page.evaluate(() => window.__scene?.project('fan'));
  if (!p) throw new Error('fan off screen');
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('scene-tooltip')).toBeVisible();
  await expect(page.getByTestId('scene-tooltip')).toContainText(/Delta AFB0712HB.*\+12\.\d\d V, 0\.\d{3} A/s);
});
