import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

const IDS = ['console', 'flt-packets', 'flt-verdicts', 'flt-commands', 'flt-logs', 'btn-console-pause', 'btn-console-copy', 'btn-export-csv', 'btn-export-json', 'tgl-raw-mpu']; // prettier-ignore

async function running(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__sim !== undefined && window.__pdm?.modelStatus().status === 'READY');
  await page.getByTestId('dock-tab-console').click();
  await page.getByTestId('sel-speed').selectOption('10');
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-play').click();
  await page.waitForFunction(() => (window.__sim?.t_s ?? 0) > 15, undefined, { timeout: 60_000 });
}
const lines = (page: Page, kind?: string) =>
  page.getByTestId('console').locator(kind ? `[data-kind="${kind}"]` : '[data-testid="console-line"]');

test('M7: every control exists; packets, verdicts, commands and logs appear in the §8.2 formats', async ({ page }) => {
  await running(page);
  for (const id of IDS) await expect(page.getByTestId(id), id).toBeVisible();
  await expect(lines(page, 'packet').last()).toHaveText(/^↑ #\d+ (NORMAL|STARTING) a=\d\.\d{3}g cf=\d+\.\d\d I=\d\.\d{3}A T=\d+\.\d\d°C dT=-?\d+\.\d\d\/min rpm=\d+$/); // prettier-ignore
  await expect(lines(page, 'verdict').last()).toHaveText(/^↓ #\d+ score=(\d\.\d\d|—)\/0\.50 (ALERT|clear|hold|unscored) dom=\S+$/); // prettier-ignore
  await expect(lines(page, 'command').first()).toHaveText(/^→ cmd START #\d+$/);
  await expect(lines(page, 'log').first()).toContainText('INFO fsm: OFF -> CALIBRATING');
  await page.getByTestId('btn-play').click(); // pause, so the lines stop moving
  await lines(page, 'packet').last().locator('button').click();
  await expect(page.getByTestId('console-json').first()).toContainText('"kind": "packet"');
});

test('M7: filters hide kinds, pause freezes the view, copy uses the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await running(page);
  await page.getByTestId('flt-verdicts').click();
  await expect(lines(page, 'verdict')).toHaveCount(0);
  expect((await page.evaluate(() => window.__pdm?.inspect().console))?.filters.verdict).toBe(false);
  await page.getByTestId('flt-verdicts').click();
  await page.getByTestId('btn-console-pause').click();
  expect((await page.evaluate(() => window.__pdm?.inspect().console))?.paused).toBe(true);
  const shown = await lines(page).count();
  const stored = (await page.evaluate(() => window.__pdm?.inspect().console))?.lines ?? 0;
  await page.waitForFunction((n) => (window.__pdm?.inspect().console.lines ?? 0) > n + 4, stored);
  expect(await lines(page).count()).toBe(shown);
  await page.getByTestId('btn-console-copy').click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.split('\n')).toHaveLength(shown);
  await page.getByTestId('btn-console-pause').click();
  await expect.poll(() => lines(page).count()).toBeGreaterThan(shown);
});

test('M7: CSV and JSON exports, and the raw MPU stream', async ({ page }) => {
  await running(page);
  await page.getByTestId('btn-play').click(); // pause, so the console holds still while exporting
  const csvDl = page.waitForEvent('download');
  await page.getByTestId('btn-export-csv').click();
  const csv = readFileSync((await (await csvDl).path()) ?? '', 'utf8')
    .trimEnd()
    .split('\n');
  const packets = (await page.evaluate(() => window.__pdm?.inspect().console))?.packets ?? -1;
  expect(csv[0]?.split(',')).toHaveLength(22);
  expect(csv[0]?.endsWith('score,threshold,alert,clear,dominant')).toBe(true);
  expect(csv.length - 1).toBe(packets);
  for (const row of csv.slice(1)) expect(row.split(',')).toHaveLength(22);
  const jsonDl = page.waitForEvent('download');
  await page.getByTestId('btn-export-json').click();
  const session = JSON.parse(readFileSync((await (await jsonDl).path()) ?? '', 'utf8')) as Record<string, unknown[]>;
  expect(session['packets']).toHaveLength(packets);
  expect((session['commands'] ?? []).length).toBe(1);
  await page.getByTestId('btn-play').click();
  await page.getByTestId('tgl-raw-mpu').click();
  await expect.poll(async () => (await page.evaluate(() => window.__pdm?.inspect().raw))?.samples ?? 0).toBeGreaterThan(1000); // prettier-ignore
  await expect(page.getByTestId('raw-mpu')).toContainText('samples');
});
