import { test, expect } from '@playwright/test';

const TOK = 'e2e-tok';

test('compila offline → torna online → sincronizza', async ({ page, context }) => {
  const postChiamate: string[] = [];
  await page.route('**/api/r/**/voce', async (route) => {
    postChiamate.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto('/__offline-e2e__');
  await expect(page.getByTestId('harness')).toHaveText('pronto');

  await page.evaluate(async (t) => {
    await window.__offline!.persistiVoce(t, 'v1', { a: 1 }, Date.now());
    await window.__offline!.sincronizzaToken(t);
  }, TOK);
  await expect.poll(() => postChiamate.length).toBeGreaterThan(0);
  let coda = await page.evaluate((t) => window.__offline!.codaPerToken(t), TOK);
  expect(coda.length).toBe(0);

  await context.setOffline(true);
  const postPrima = postChiamate.length;
  await page.evaluate(async (t) => {
    await window.__offline!.persistiVoce(t, 'v2', { b: 2 }, Date.now());
    await window.__offline!.sincronizzaToken(t);
  }, TOK);
  coda = await page.evaluate((t) => window.__offline!.codaPerToken(t), TOK);
  expect(coda.length).toBe(1);
  expect(postChiamate.length).toBe(postPrima);

  await context.setOffline(false);
  await page.evaluate((t) => window.__offline!.sincronizzaToken(t), TOK);
  await expect.poll(async () => (await page.evaluate((t) => window.__offline!.codaPerToken(t), TOK)).length).toBe(0);
  expect(postChiamate.length).toBeGreaterThan(postPrima);
});
