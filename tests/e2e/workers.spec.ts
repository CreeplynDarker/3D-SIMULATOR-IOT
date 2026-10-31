import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./?debug=1');
  await page.waitForFunction(() => window.__pdm !== undefined);
});

for (const target of ['sim', 'rcf'] as const) {
  test(`${target} worker answers ping with pong in under 50 ms`, async ({ page }) => {
    // Building the default model's forest at boot blocks the RCF worker once (D-043); measure after it.
    if (target === 'rcf') await page.waitForFunction(() => window.__pdm?.modelStatus().status === 'READY');
    // Measure the workers, not software WebGL on a GPU-less runner: stop the 3D render loop (D-068) and wait until
    // the last frame is drawn and the page has settled.
    await page.waitForFunction(() => window.__pdm?.modelStatus().status === 'READY');
    await page.evaluate(() => window.__pdm?.setRendering(false));
    await page.waitForFunction(
      () =>
        new Promise<boolean>((done) => {
          const f0 = window.__scene?.frames() ?? 0;
          setTimeout(() => done((window.__scene?.frames() ?? 0) === f0), 300);
        }),
    );
    const rtts = await page.evaluate(async (t) => {
      const api = window.__pdm;
      if (!api) throw new Error('debug API missing');
      await api.ping(t); // warm-up: the first ping may wait for the worker module to load
      const out: number[] = [];
      for (let i = 0; i < 5; i++) out.push(await api.ping(t));
      return out;
    }, target);
    expect(rtts).toHaveLength(5);
    for (const rtt_ms of rtts) expect(rtt_ms).toBeLessThan(50);
  });
}

test('the debug API is absent without ?debug=1', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('viewport').waitFor();
  expect(await page.evaluate(() => window.__pdm === undefined)).toBe(true);
});

test('a packet posted by the sim stub reaches the RCF stub through the channel', async ({ page }) => {
  await page.evaluate(() => window.__pdm?.play());
  await page.waitForFunction(() => {
    const api = window.__pdm;
    return api !== undefined && api.rcfVerdicts().length > 0 && api.simVerdictsIn().length > 0;
  });
  const result = await page.evaluate(() => {
    const api = window.__pdm;
    if (!api) throw new Error('debug API missing');
    return { packets: api.simPackets(), rcf: api.rcfVerdicts(), simIn: api.simVerdictsIn() };
  });
  const sent = result.packets[0];
  expect(sent?.kind).toBe('packet');
  // The RCF stub answers the packet it received over the channel, and the verdict comes back to the sim the same way.
  expect(result.rcf[0]?.seq_ref).toBe(sent?.seq);
  expect(result.simIn[0]?.seq_ref).toBe(sent?.seq);
});
