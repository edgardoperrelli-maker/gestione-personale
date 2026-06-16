import { test, expect } from '@playwright/test';

const TOK = 'e2e-tok';

test('compila offline → torna online → sincronizza', async ({ page, context }) => {
  const postChiamate: string[] = [];
  const postBodies: Array<{ voceId?: string; taskId?: string; risposte?: Record<string, unknown> }> = [];
  await page.route('**/api/r/**/voce', async (route) => {
    postChiamate.push(route.request().url());
    postBodies.push(JSON.parse(route.request().postData() ?? '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto('/offline-e2e');
  await expect(page.getByTestId('harness')).toHaveText('pronto');

  await page.evaluate(async (t) => {
    await window.__offline!.persistiVoce(t, 'v1', { a: 1 }, Date.now(), 'task-1');
    await window.__offline!.sincronizzaToken(t);
  }, TOK);
  await expect.poll(() => postChiamate.length).toBeGreaterThan(0);
  // Il salvataggio invia anche la chiave stabile taskId (riaggancio dopo rigenerazione lato ufficio).
  expect(postBodies[0]?.voceId).toBe('v1');
  expect(postBodies[0]?.taskId).toBe('task-1');
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

test('foto offline → al sync la voce riceve il PATH reale (non il placeholder)', async ({ page, context }) => {
  const TOKF = 'e2e-foto';
  const FOTO_PATH = 'rapportini/r/REALE.jpg';
  let fotoUpload = 0;
  const voceBodies: Array<{ voceId?: string; risposte?: Record<string, unknown> }> = [];

  await page.route('**/api/r/**/foto-campo', async (route) => {
    fotoUpload += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ path: FOTO_PATH }) });
  });
  await page.route('**/api/r/**/voce', async (route) => {
    voceBodies.push(JSON.parse(route.request().postData() ?? '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto('/offline-e2e');
  await expect(page.getByTestId('harness')).toHaveText('pronto');

  // OFFLINE: allega una foto (blob in coda) e scrivi il placeholder nella risposta della voce.
  await context.setOffline(true);
  const placeholder = await page.evaluate(async (t) => {
    const blob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
    const ph = await window.__offline!.accodaFoto(t, 'v1', 'foto', blob, Date.now());
    await window.__offline!.persistiVoce(t, 'v1', { foto: ph }, Date.now());
    return ph;
  }, TOKF);
  expect(placeholder).toMatch(/^blob-locale:/);

  // ONLINE: sincronizza.
  await context.setOffline(false);
  await page.evaluate((t) => window.__offline!.sincronizzaToken(t), TOKF);

  // La foto è stata caricata e la coda si è svuotata...
  await expect.poll(() => fotoUpload).toBeGreaterThan(0);
  await expect.poll(async () => (await page.evaluate((t) => window.__offline!.codaPerToken(t), TOKF)).length).toBe(0);
  // ...e la voce inviata al server contiene il PATH REALE, non il placeholder (regressione bug 2b).
  const voceBody = voceBodies[voceBodies.length - 1];
  expect(voceBody?.risposte?.foto).toBe(FOTO_PATH);
  expect(String(voceBody?.risposte?.foto)).not.toMatch(/^blob-locale:/);
  // dbLavoro locale aggiornato col path reale.
  const lavoro = await page.evaluate((t) => window.__offline!.risposteLavoro(t, 'v1'), TOKF);
  expect(lavoro?.foto).toBe(FOTO_PATH);
});
