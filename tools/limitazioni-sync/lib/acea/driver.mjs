// tools/limitazioni-sync/lib/acea/driver.mjs
// Driver SAP Fiori (iframe-aware) per il Cruscotto "Pianificazione Lavori Idrico" di ACEA.
// Flusso reale (ricavato col Playwright codegen):
//   launchpad → (eventuale "Effettua nuovamente il logon") → login Account utente+Password
//   → tile "Pianificazione Lavori Idrico" → iframe app → Cruscotto
//   → filtri: Contratto + Data pubblicazione lavoro ≥ + "Escludi ODM chiusi" OFF
//   → Ricerca → Esportazione → scarica l'Excel.
// Playwright caricato con import() dinamico: i tick normali non lo toccano.
//
// I controlli SAP UI5 hanno ID auto-generati instabili (__input1, __switch0, …): qui si usano
// SOLO locatori per ruolo/etichetta/testo + digitazione diretta dei valori, così l'automazione
// sopravvive ai re-render. Strumentato: screenshot per passo in acea.debug; gli errori riportano
// il passo fallito. Per calibrare metti "headless": false nel config.
import fs from 'node:fs';
import path from 'node:path';

const FRAME = 'iframe[title="Applicazione"]';

/** Login + apertura del Cruscotto (passi condivisi tra export e assegnazione).
 *  Ritorna browser/page/app(frameLocator)/shot. Il chiamante DEVE chiudere browser. */
export async function apriCruscotto(acea, { stamp = 'manual' } = {}) {
  const { chromium } = await import('playwright');
  fs.mkdirSync(acea.download, { recursive: true });
  if (acea.debug) fs.mkdirSync(acea.debug, { recursive: true });

  const browser = await chromium.launch({
    channel: acea.browser ?? 'msedge',
    headless: acea.headless !== false, // default headless; "headless": false per vedere il browser (calibrazione)
  });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(acea.timeoutMs ?? 60_000);

  let passo = 'init';
  const shot = async (nome) => {
    if (!acea.debug) return;
    try { await page.screenshot({ path: path.join(acea.debug, `acea-${stamp}-${nome}.png`), fullPage: true }); } catch { /* best effort */ }
  };

  try {
    // 1) Launchpad SAP
    passo = 'goto-launchpad';
    await page.goto(acea.loginUrl, { waitUntil: 'domcontentloaded' });

    // 2) Eventuale pagina di logoff con il bottone "Effettua nuovamente il logon"
    passo = 'relogon';
    const relogon = page.getByRole('button', { name: 'Effettua nuovamente il logon' });
    if (await relogon.isVisible().catch(() => false)) await relogon.click();

    // 3) Login: Account utente + Password (invio con Enter, niente OTP)
    passo = 'login-utente';
    const user = page.getByRole('textbox', { name: 'Account utente' });
    await user.waitFor({ state: 'visible' });
    await user.fill(acea.username);
    await user.press('Enter');

    passo = 'login-password';
    const pass = page.getByRole('textbox', { name: 'Password' });
    await pass.waitFor({ state: 'visible' });
    await pass.fill(acea.password);
    await pass.press('Enter');

    // 4) Launchpad → apri l'app "Pianificazione Lavori Idrico"
    passo = 'apri-app';
    const tile = page.getByRole('link', { name: 'Pianificazione Lavori Idrico' });
    await tile.waitFor({ state: 'visible' });
    await tile.click();

    // 5) Entra nell'iframe dell'app e assicurati di essere sul Cruscotto (form con il campo Contratto)
    passo = 'cruscotto';
    const app = page.frameLocator(FRAME);
    const contratto = app.getByRole('textbox', { name: /Contratto/i }).first();
    if (!(await contratto.isVisible().catch(() => false))) {
      await app.getByText('Cruscotto schedulazione e pianificazione interventi').first().click();
    }
    await contratto.waitFor({ state: 'visible' });
    await shot('1-form');
    return { browser, page, app, shot };
  } catch (e) {
    await shot(`errore-${passo}`);
    await browser.close();
    throw new Error(`[ACEA driver] login fallito al passo "${passo}": ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function loginEdEsporta(acea, { stamp = 'manual' } = {}) {
  const { browser, page, app, shot } = await apriCruscotto(acea, { stamp });
  const ric = acea.ricerca ?? {};
  let passo = 'post-login';
  try {
    // 6a) Filtro Contratto: digitazione diretta + verifica che il Fornitore si risolva
    passo = 'filtro-contratto';
    const contratto = app.getByRole('textbox', { name: /Contratto/i }).first();
    await contratto.fill(String(ric.contratto ?? ''));
    await contratto.press('Enter');
    await app.getByText('PLENZICH', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 15_000 });

    // 6b) Filtro Data pubblicazione lavoro ≥ : digitazione diretta (operatore ≥ è il default)
    passo = 'filtro-data';
    const dataDa = app.getByRole('textbox', { name: /Data pubblicazione lavoro/i }).first();
    await dataDa.fill(String(ric.dataPubblicazioneDa ?? ''));
    await dataDa.press('Enter');

    // 6c) "Escludi ODM chiusi" → OFF (idempotente): vogliamo includere anche i completati
    passo = 'filtro-switch';
    const sw = app.getByRole('switch', { name: /Escludi ODM chiusi/i }).first();
    const acceso = await sw.getAttribute('aria-checked').catch(() => null);
    const vuoiAcceso = ric.escludiOdmChiusi === true;
    if (acceso === 'true' && !vuoiAcceso) await sw.click();
    else if (acceso === 'false' && vuoiAcceso) await sw.click();
    else if (acceso === null && !vuoiAcceso) {
      // fallback se lo switch non espone aria-checked: un click (default ATT.→DIS.)
      await sw.click().catch(() => {});
    }
    await shot('2-filtri');

    // 7) Ricerca
    passo = 'ricerca';
    await app.getByRole('button', { name: 'Ricerca' }).click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot('3-risultati');

    // 8) Esportazione → download
    passo = 'esportazione';
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      app.getByRole('button', { name: 'Esportazione' }).click(),
    ]);
    const dest = path.join(acea.download, `acea-${stamp}-${download.suggestedFilename() || 'export.xlsx'}`);
    await download.saveAs(dest);
    await shot('4-scaricato');
    return dest;
  } catch (e) {
    await shot(`errore-${passo}`);
    throw new Error(`[ACEA driver] fallito al passo "${passo}": ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await browser.close();
  }
}
