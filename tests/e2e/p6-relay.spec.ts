import { expect, test } from '@playwright/test';

// P6 accept: on a trip the order is CRITICAL → RELAY_OPEN → rpm < 100; the CH2 arm and LED follow; W04 dims.
test('P6.3: S2 trip — CRITICAL, RELAY_OPEN, W04 dimmed, rpm < 100 in that order; arm, LED and click follow', async ({
  page,
}) => {
  // prettier-ignore
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('./?debug=1');
  await page.waitForFunction(() => (window.__scene?.frames() ?? 0) > 5 && window.__pdm?.modelStatus().status === 'READY', undefined, { timeout: 60_000 }); // prettier-ignore
  expect(await page.evaluate(() => window.__scene?.anim().relay)).toMatchObject({ arm: 'NC', led: false });
  await page.getByTestId('tgl-sound').click();
  await page.getByTestId('sel-speed').selectOption('4');
  await page.getByTestId('sel-scenario').selectOption('S2');
  await page.waitForFunction(() => window.__scene?.anim().relay.arm === 'NO', undefined, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__scene?.anim().relay)).toMatchObject({ led: true });
  // Record the sim time at which the fan first drops below 100 rpm after the trip.
  const rpmBelow_s = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const poll = () => {
          const s = window.__pdm?.snapshot();
          if (s && s.state === 'CRITICAL' && s.rpm < 100) resolve(s.t_s);
          else setTimeout(poll, 20);
        };
        poll();
      }),
  );
  const events = await page.evaluate(() => window.__pdm?.events() ?? []);
  const critical_s = events.find((e) => e.type === 'CRITICAL')?.t_s ?? NaN;
  const relayOpen_s = events.find((e) => e.type === 'RELAY_OPEN')?.t_s ?? NaN;
  const relay = await page.evaluate(() => window.__scene?.anim().relay);
  // W04's log starts with its initial (dim) state at t = 0; the trip's change is the one after CRITICAL.
  const w04 = (await page.evaluate(() => window.__scene?.anim().flow.log ?? [])).find((c) => c.id === 'W04' && !c.energised && c.t_s >= critical_s); // prettier-ignore
  process.stdout.write(`TRIP critical=${critical_s} relayOpen=${relayOpen_s} w04Dim=${w04?.t_s} rpmBelow100=${rpmBelow_s} clicks=${relay?.clicks}\n`); // prettier-ignore
  expect(critical_s).toBeLessThan(relayOpen_s);
  expect(relayOpen_s - critical_s).toBeLessThanOrEqual(0.02);
  expect(w04?.t_s ?? NaN).toBeGreaterThanOrEqual(relayOpen_s);
  expect(w04?.t_s ?? NaN).toBeLessThan(rpmBelow_s);
  expect(rpmBelow_s - critical_s).toBeLessThanOrEqual(15);
  expect(relay).toMatchObject({ arm: 'NC', led: false });
  expect(relay?.changes).toBe(2); // closed at START, opened at the trip
  expect(relay?.clicks).toBe(2); // sound on: one click per change
});
