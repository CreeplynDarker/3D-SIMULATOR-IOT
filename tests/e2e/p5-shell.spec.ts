import { expect, type Page, test } from '@playwright/test';

const REGIONS = ['region-topbar', 'region-left', 'region-viewport', 'region-right', 'region-dock'] as const;

async function boxes(page: Page) {
  const out: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const id of REGIONS) {
    const b = await page.getByTestId(id).boundingBox();
    if (!b) throw new Error(`${id} has no box`);
    out[id] = b;
  }
  return out;
}

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('./?debug=1');
  // the canvas has mounted (window.__scene) before its render loop stops
  await page.waitForFunction(() => window.__pdm !== undefined && window.__scene !== undefined);
  await page.evaluate(() => window.__pdm?.setRendering(false)); // logic only: no software-WebGL load (D-077)
}

for (const [width, height] of [
  [1280, 720],
  [1920, 1080],
] as const) {
  test(`all regions are present side by side at ${width} × ${height} (§8.1)`, async ({ page }) => {
    await open(page, width, height);
    for (const id of REGIONS) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId('viewport')).toBeVisible();
    const b = await boxes(page);
    expect(b['region-topbar']?.height).toBeCloseTo(48, 0);
    expect(b['region-left']?.width).toBeCloseTo(320, 0);
    expect(b['region-right']?.width).toBeCloseTo(340, 0);
    expect(b['region-dock']?.height).toBeCloseTo(280, 0);
    // left | viewport | right on one row, the dock under all three, nothing past the window
    const left = b['region-left'];
    const vp = b['region-viewport'];
    const right = b['region-right'];
    const dock = b['region-dock'];
    if (!left || !vp || !right || !dock) throw new Error('missing region');
    expect(left.x + left.width).toBeLessThanOrEqual(vp.x + 1);
    expect(vp.x + vp.width).toBeLessThanOrEqual(right.x + 1);
    expect(dock.y).toBeGreaterThanOrEqual(vp.y + vp.height - 1);
    expect(dock.y + dock.height).toBeLessThanOrEqual(height + 1);
    expect(right.x + right.width).toBeLessThanOrEqual(width + 1);
  });
}

test('below 1280 px the side columns stack under the viewport', async ({ page }) => {
  await open(page, 1100, 800);
  const b = await boxes(page);
  const vp = b['region-viewport'];
  const left = b['region-left'];
  const right = b['region-right'];
  if (!vp || !left || !right) throw new Error('missing region');
  expect(left.y).toBeGreaterThanOrEqual(vp.y + vp.height - 1);
  expect(right.y).toBeGreaterThanOrEqual(left.y + left.height - 1);
  expect(left.width).toBeCloseTo(1100, -1);
});

test('dock tabs switch the dock, and dragging its edge resizes it within 160–480 px', async ({ page }) => {
  await open(page, 1920, 1080);
  for (const tab of ['console', 'code', 'testlog', 'charts'] as const) {
    await page.getByTestId(`dock-tab-${tab}`).click();
    expect(await page.evaluate(() => window.__pdm?.inspect().ui.dockTab)).toBe(tab);
  }
  const handle = page.getByTestId('dock-resize');
  const h = await handle.boundingBox();
  if (!h) throw new Error('no handle');
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y - 500, { steps: 5 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__pdm?.inspect().ui.dockHeight_px)).toBe(480);
  expect((await page.getByTestId('region-dock').boundingBox())?.height).toBeCloseTo(480, 0);
});

test('M1 viewport toggles and the vibration slider change the store', async ({ page }) => {
  await open(page, 1920, 1080);
  for (const [id, key] of [
    ['tgl-flow', 'flow'],
    ['tgl-labels', 'labels'],
    ['tgl-airflow', 'airflow'],
    ['tgl-heat', 'heat'],
  ] as const) {
    // prettier-ignore
    const before = await page.evaluate((k) => window.__pdm?.inspect().ui.toggles[k], key);
    await page.getByTestId(id).click();
    expect(await page.evaluate((k) => window.__pdm?.inspect().ui.toggles[k], key)).toBe(!before);
  }
  const slider = page.getByTestId('sld-vib-exaggeration');
  await expect(slider).toHaveAttribute('min', '1');
  await expect(slider).toHaveAttribute('max', '50');
  await slider.fill('25');
  expect(await page.evaluate(() => window.__pdm?.inspect().ui.vibExaggeration)).toBe(25);
});

test('the theme follows ui.theme', async ({ page }) => {
  await open(page, 1280, 720);
  const isDark = () => page.getByTestId('app-shell').evaluate((el) => el.classList.contains('dark'));
  expect(await isDark()).toBe(true);
  await page.evaluate(() => window.__scene?.setTheme('light'));
  await expect.poll(isDark).toBe(false);
});
