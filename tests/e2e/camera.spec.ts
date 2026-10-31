import { expect, type Page, test } from '@playwright/test';

const PRESETS = ['overview', 'fan', 'esp32', 'relay', 'breadboard'] as const;

async function ready(page: Page) {
  await page.goto('./?debug=1');
  await page.waitForFunction(() => (window.__scene?.frames() ?? 0) > 5 && window.__scene?.texturesReady() === true);
}

/** Waits for the 600 ms camera transition to finish and a couple more frames to draw. */
async function settled(page: Page) {
  await page.waitForFunction(() => window.__scene?.cameraMoving() === false);
  const f = await page.evaluate(() => window.__scene?.frames() ?? 0);
  await page.waitForFunction((n) => (window.__scene?.frames() ?? 0) > n + 2, f);
}

test('each camera preset button moves the camera and changes the picture', async ({ page }) => {
  test.setTimeout(90_000); // six eased moves and six viewport screenshots
  await ready(page);
  const viewport = page.getByTestId('viewport');
  let previous = await viewport.screenshot();
  // start from a non-default preset so the first button (overview) also moves the camera
  for (const name of ['breadboard', ...PRESETS] as const) {
    const before = await page.evaluate(() => window.__scene?.cameraPosition());
    await page.getByTestId(`cam-${name}`).click();
    await settled(page);
    const after = await page.evaluate(() => window.__scene?.cameraPosition());
    expect(after, `cam-${name} moves the camera`).not.toEqual(before);
    const shot = await viewport.screenshot();
    expect(shot.equals(previous), `cam-${name} changes the screenshot`).toBe(false);
    previous = shot;
  }
});

test('clicking the fan selects it', async ({ page }) => {
  await ready(page);
  await page.getByTestId('cam-fan').click();
  await settled(page);
  const point = await page.evaluate(() => window.__scene?.project('fan'));
  if (!point) throw new Error('fan is not on screen');
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => page.evaluate(() => window.__scene?.selectedId())).toBe('fan');
  // clicking empty space in the viewport (its top-left corner shows only background) clears the selection
  const vp = await page.getByTestId('viewport').boundingBox();
  if (!vp) throw new Error('no viewport');
  await page.mouse.click(vp.x + 5, vp.y + 5);
  await expect.poll(() => page.evaluate(() => window.__scene?.selectedId())).toBeNull();
});
