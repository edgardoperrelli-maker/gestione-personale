// tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs
// Driver Playwright di SCRITTURA: per ogni ODL apre la riga nel Cruscotto e assegna l'operatore.
// Selettori SAP UI5 instabili → SOLO locatori per ruolo/etichetta/testo (mai __input1).
//
// ⚠️ DA CALIBRARE sul PC del lavoro col codegen:
//   npx playwright codegen --channel msedge "<loginUrl>"
//   → registrare: ricerca ODL nel Cruscotto, apertura riga, campo "Risorsa"/operatore, salvataggio.
//   Trascrivere qui SOTTO i locatori reali (per ruolo/etichetta), nei punti marcati [CALIBRARE].
import { apriCruscotto } from './driver.mjs';

export async function assegnaInterventi(acea, righe, { stamp = 'manual', dryRun = true } = {}) {
  const esiti = [];
  if (!Array.isArray(righe) || righe.length === 0) return { esiti };

  const { browser, page, app, shot } = await apriCruscotto(acea, { stamp });
  try {
    for (const r of righe) {
      let passo = `cerca-${r.odl}`;
      try {
        // [CALIBRARE] 1) cercare/filtrare l'ODL nel Cruscotto
        //   es.: const cerca = app.getByRole('textbox', { name: /Ordine|ODL/i }).first();
        //        await cerca.fill(String(r.odl)); await cerca.press('Enter');

        // [CALIBRARE] 2) aprire la riga dell'ODL
        //   es.: await app.getByRole('row', { name: new RegExp(r.odl) }).first().click();

        // [CALIBRARE] 3) impostare l'operatore (campo "Risorsa"): autocomplete/dropdown/testo
        passo = `assegna-${r.odl}`;
        //   es.: const risorsa = app.getByRole('textbox', { name: /Risorsa|Operatore/i }).first();
        //        await risorsa.fill(r.operatoreAcea); ...selezione voce...

        if (dryRun) {
          await shot(`dry-${r.odl}`);
          // 'simulato' (non 'assegnato'): il dry-run NON deve marcare l'ODL come assegnato nel log.
          esiti.push({ odl: r.odl, esito: 'simulato', motivo: 'dry-run (non salvato)' });
          continue;
        }

        // [CALIBRARE] 4) salvare l'assegnazione
        passo = `salva-${r.odl}`;
        //   es.: await app.getByRole('button', { name: 'Salva' }).click();
        //        await page.waitForLoadState('networkidle').catch(() => {});
        await shot(`ok-${r.odl}`);
        esiti.push({ odl: r.odl, esito: 'assegnato' });
      } catch (e) {
        await shot(`errore-${passo}`);
        esiti.push({ odl: r.odl, esito: 'fallito', motivo: `passo "${passo}": ${e instanceof Error ? e.message : String(e)}` });
      }
    }
    return { esiti };
  } finally {
    await browser.close();
  }
}
