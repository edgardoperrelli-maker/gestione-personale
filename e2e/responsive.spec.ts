import { test, expect, type Page } from '@playwright/test';

/**
 * La UI rapportino deve adattarsi agli smartphone degli operatori, iPhone e
 * Android: 320px è il caso peggiore reale (iPhone con "Zoom display" attivo,
 * o Android compatti), 360px è la larghezza Android più diffusa, 375/390 gli
 * iPhone standard, 412 i Pixel/Galaxy grandi.
 */

const LARGHEZZE = [320, 360, 375, 390, 412];

async function apriLista(page: Page) {
  await page.goto('/offline-e2e/lista');
  await expect(page.getByRole('button', { name: 'Invia rapportino' })).toBeVisible();
}

function overflowOrizzontale(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const larghezza of LARGHEZZE) {
  test(`lista senza overflow orizzontale a ${larghezza}px`, async ({ page }) => {
    await page.setViewportSize({ width: larghezza, height: 700 });
    await apriLista(page);
    expect(await overflowOrizzontale(page)).toBeLessThanOrEqual(0);
  });

  // La voce con attività classica apre VoceFocus (il form esito).
  test(`focus voce senza overflow orizzontale a ${larghezza}px`, async ({ page }) => {
    await page.setViewportSize({ width: larghezza, height: 700 });
    await apriLista(page);
    await page.getByRole('button', { name: /BIANCHI/ }).click();
    await expect(page.getByRole('button', { name: /Salva e avanti/ })).toBeVisible();
    expect(await overflowOrizzontale(page)).toBeLessThanOrEqual(0);
  });

  // La voce BONIFICHE EXTRA apre il contenitore task-via (TaskViaFocus).
  test(`contenitore task-via senza overflow orizzontale a ${larghezza}px`, async ({ page }) => {
    await page.setViewportSize({ width: larghezza, height: 700 });
    await apriLista(page);
    await page.getByRole('button', { name: /ROSSI MA/ }).click();
    await expect(page.getByRole('button', { name: /Aggiungi intervento/ })).toBeVisible();
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

test('a 360px la ricerca espansa resta dentro lo schermo', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await apriLista(page);
  await page.getByRole('button', { name: 'Cerca tra i tuoi ordini' }).click();
  const input = page.getByRole('textbox', { name: 'Cerca' });
  await expect(input).toBeVisible();
  expect(await overflowOrizzontale(page)).toBeLessThanOrEqual(0);
  const box = await input.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
});

test('a 360px la modale nuovo intervento non sborda', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await apriLista(page);
  await page.getByRole('button', { name: 'Aggiungi intervento manuale' }).click();
  await expect(page.getByRole('heading', { name: 'Nuovo intervento' })).toBeVisible();
  expect(await overflowOrizzontale(page)).toBeLessThanOrEqual(0);
});

test('a 320px il titolo resta leggibile anche con i badge Nuovo/Sospeso', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await apriLista(page);
  // Voce manuale (badge "Nuovo" + stato approvazione + nota + attività lunga):
  // il titolo non deve collassare a zero, deve tenere almeno ~10 caratteri.
  const titolo = page.getByText(/COLOMBO/);
  await expect(titolo).toBeVisible();
  const box = await titolo.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(70);
});

test('a 320px lo stato inviato (condivisione PDF) non sborda', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/offline-e2e/lista?inviato=1');
  await expect(page.getByText('Rapportino inviato ✓')).toBeVisible();
  expect(await overflowOrizzontale(page)).toBeLessThanOrEqual(0);
});
