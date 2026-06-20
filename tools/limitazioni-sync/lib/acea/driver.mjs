// tools/limitazioni-sync/lib/acea/driver.mjs
// Imperativo: login ACEA + filtri fissi → Cerca → Esporta → scarica il file.
// Playwright caricato con import() dinamico: i tick normali non lo toccano.
import fs from 'node:fs';
import path from 'node:path';

const TIMEOUT = 60_000;

export async function loginEdEsporta(acea, { stamp = 'manual' } = {}) {
  const { chromium } = await import('playwright');
  fs.mkdirSync(acea.download, { recursive: true });
  if (acea.debug) fs.mkdirSync(acea.debug, { recursive: true });

  const browser = await chromium.launch({ channel: acea.browser ?? 'msedge', headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  try {
    await page.goto(acea.loginUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.fill(acea.login.campoUser, acea.username);
    await page.fill(acea.login.campoPass, acea.password);
    await page.click(acea.login.bottoneLogin);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    for (const f of acea.ricerca.filtri ?? []) {
      if (f.tipo === 'select') await page.selectOption(f.selettore, f.valore);
      else await page.fill(f.selettore, String(f.valore));
    }
    await page.click(acea.ricerca.bottoneCerca);
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      page.click(acea.ricerca.bottoneEsporta),
    ]);
    const dest = path.join(acea.download, `acea-${stamp}-${download.suggestedFilename()}`);
    await download.saveAs(dest);
    return dest;
  } catch (e) {
    if (acea.debug) {
      try { await page.screenshot({ path: path.join(acea.debug, `acea-errore-${stamp}.png`), fullPage: true }); } catch { /* best effort */ }
    }
    throw e;
  } finally {
    await browser.close();
  }
}
