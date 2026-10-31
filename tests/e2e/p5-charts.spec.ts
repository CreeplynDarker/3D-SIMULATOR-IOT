import { expect, type Page, test } from '@playwright/test';

const CHARTS = ['chart-arms', 'chart-cf', 'chart-irms', 'chart-temp', 'chart-rpm', 'chart-score'];

async function running(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__sim !== undefined && window.__pdm?.modelStatus().status === 'READY');
  await page.getByTestId('sel-speed').selectOption('10');
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-play').click();
  await page.waitForFunction(() => (window.__sim?.t_s ?? 0) > 25, undefined, { timeout: 60_000 });
}
const points = (page: Page, id: string) =>
  page.getByTestId(id).evaluate((el) => Number(el.getAttribute('data-points')));

test('M6: six uPlot strips, the window selector and freeze', async ({ page }) => {
  test.setTimeout(120_000);
  await running(page);
  for (const id of [...CHARTS, 'sel-chart-window', 'btn-chart-freeze'])
    await expect(page.getByTestId(id), id).toBeVisible();
  for (const id of CHARTS) {
    await expect(page.getByTestId(id).locator('canvas')).toHaveCount(1);
    expect(await points(page, id), id).toBeGreaterThan(20);
  }
  await page.getByTestId('sel-chart-window').selectOption('30');
  expect((await page.evaluate(() => window.__pdm?.inspect().ui))?.chartWindow_s).toBe(30);
  await page.waitForFunction(() => (window.__sim?.t_s ?? 0) > 40, undefined, { timeout: 60_000 });
  await expect.poll(() => points(page, 'chart-rpm')).toBeLessThanOrEqual(30);
  await page.getByTestId('btn-chart-freeze').click();
  expect((await page.evaluate(() => window.__pdm?.inspect().ui))?.chartFrozen).toBe(true);
  const frozenLast = await page.getByTestId('chart-rpm').getAttribute('data-last-t');
  await page.waitForFunction(() => (window.__sim?.t_s ?? 0) > 50, undefined, { timeout: 60_000 });
  expect(await page.getByTestId('chart-rpm').getAttribute('data-last-t')).toBe(frozenLast);
  await page.getByTestId('btn-chart-freeze').click();
  await expect.poll(() => page.getByTestId('chart-rpm').getAttribute('data-last-t')).not.toBe(frozenLast);
});

test('M6: cursors are synced across the strips', async ({ page }) => {
  test.setTimeout(90_000);
  await running(page);
  const over = await page.getByTestId('chart-arms').locator('.u-over').boundingBox();
  if (!over) throw new Error('no plot area');
  await page.mouse.move(over.x + over.width * 0.6, over.y + over.height / 2);
  const lefts = await page.evaluate((ids) => ids.map((id) => {
    const el = document.querySelector(`[data-testid="${id}"] .u-cursor-x`) as HTMLElement | null;
    return el ? el.getBoundingClientRect().left - (el.closest('.u-wrap')?.getBoundingClientRect().left ?? 0) : null;
  }), CHARTS); // prettier-ignore
  for (const left of lefts) expect(left).not.toBeNull();
  for (const left of lefts) expect(Math.abs((left ?? 0) - (lefts[0] ?? 0))).toBeLessThan(3);
});
