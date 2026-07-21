import { test, expect, type Page } from '@playwright/test';

/**
 * La lista rapportino deve adattarsi agli schermi iPhone stretti: 320px è il
 * viewport effettivo di un iPhone con "Zoom display" attivo (o SE), il caso
 * peggiore reale segnalato dagli operatori.
 */

async function apriLista(page: Page) {
  await page.goto('/offline-e2e/lista');
  await expect(page.getByRole('button', { name: 'Invia rapportino' })).toBeVisible();
}

function overflowOrizzontale(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const larghezza of [320, 375, 390]) {
  test(`lista senza overflow orizzontale a ${larghezza}px`, async ({ page }) => {
    await page.setViewportSize({ width: larghezza, height: 700 });
    await apriLista(page);
    expect(await overflowOrizzontale(page)).toBeLessThanOrEqual(0);
  });
}

test('a 320px i tre filtri restano interi dentro lo schermo', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await apriLista(page);
  for (const nome of [/Tutti/, /Da fare/, /Completati/]) {
    const tab = page.getByRole('button', { name: nome }).first();
    await expect(tab).toBeVisible();
    const box = await tab.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
});

test('a 320px il titolo delle righe non è schiacciato dalla colonna attività', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await apriLista(page);
  // La voce con attività lunga (BONIFICHE EXTRA) deve lasciare al titolo
  // almeno metà riga: si misura lo span del titolo della prima card.
  const titolo = page.getByText('ROSSI MARIO');
  await expect(titolo).toBeVisible();
  const box = await titolo.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(80);
});
