// tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs
// Driver Playwright di SCRITTURA: assegna gli ODL agli operatori sul Cruscotto ACEA.
// Selettori SAP UI5 instabili → locatori per ruolo/etichetta/testo.
//
// Flusso reale (dal codegen + screenshot ACEA), raggruppato PER OPERATORE:
//   apriCruscotto → per ogni OPERATORE:
//     0) "Nuova ricerca" (reset al form: il portale ricorda l'ultima ricerca/risultati)
//     1) Contratto (precompilato; fill+Enter risolve il Fornitore) + "Escludi ODM chiusi" OFF
//     2) campo "Numero OdM" → dialog "Ricerca: Numero OdM" → "Svuota tabella" →
//        INCOLLA TUTTI gli ODL dell'operatore (uno per riga) → "Inserisci OdM"
//     3) "Ricerca" → risultati con TUTTI gli ODL di quell'operatore   (dry-run: si ferma qui)
//     4) per ogni riga: apri → "Modificare" → "Definizione risorse" → aggiungi dipendente →
//        seleziona l'operatore per COGNOME → "Ok" → "Team Leader" → "Salva" → "OK"
import { apriCruscotto } from './driver.mjs';

const cognomeDa = (s) => String(s ?? '').trim().split(/\s+/)[0] || '';

export async function assegnaInterventi(acea, righe, { stamp = 'manual', dryRun = true } = {}) {
  const esiti = [];
  if (!Array.isArray(righe) || righe.length === 0) return { esiti };

  // raggruppa per operatore (preserva l'ordine di prima apparizione)
  const perOperatore = new Map();
  for (const r of righe) {
    const k = String(r.operatoreAcea ?? '').trim();
    if (!perOperatore.has(k)) perOperatore.set(k, []);
    perOperatore.get(k).push(r);
  }

  const { browser, page, app, shot } = await apriCruscotto(acea, { stamp });

  // Torna al FORM di ricerca pulito (se siamo sui risultati c'è "Nuova ricerca").
  const vaiAlForm = async () => {
    const nuova = app.getByRole('button', { name: 'Nuova ricerca' });
    if (await nuova.isVisible().catch(() => false)) {
      await nuova.click();
      await page.waitForLoadState('networkidle').catch(() => {});
    }
  };

  try {
    for (const [operatore, ordini] of perOperatore) {
      const cognome = cognomeDa(operatore);
      let passo = `form-${cognome}`;
      try {
        // 0) reset al form (solo al cambio operatore) + attendi che il form sia pronto
        await vaiAlForm();
        await app.getByRole('button', { name: 'Ricerca' }).first().waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForLoadState('networkidle').catch(() => {});

        // 1) NB: il Contratto è precompilato e DISABILITATO (Fornitore già risolto) → NON va riempito.
        //    "Escludi ODM chiusi" SEMPRE OFF
        const sw = app.getByRole('switch', { name: /Escludi ODM chiusi/i }).first();
        if (await sw.isVisible().catch(() => false)) {
          const on = await sw.isChecked().catch(() => null);
          if (on === true) await sw.click();
        }

        // 2) apri il dialog "Numero OdM", svuota, INCOLLA tutti gli ODL dell'operatore, Inserisci OdM
        passo = `cerca-${cognome}`;
        const cellaOdM = app.getByRole('gridcell', { name: 'Numero OdM' }).getByLabel('Numero OdM');
        await cellaOdM.scrollIntoViewIfNeeded().catch(() => {});
        await cellaOdM.waitFor({ state: 'visible', timeout: 30_000 });
        await cellaOdM.click();
        const svuota = app.getByRole('button', { name: 'Svuota tabella' });
        await svuota.waitFor({ state: 'visible', timeout: 15_000 });
        await svuota.click().catch(() => {});
        const elenco = ordini.map((o) => String(o.odl)).join('\n');
        const inp = app.getByRole('textbox', { name: 'Numero OdM' }).last();
        await inp.fill(elenco); // incolla tutti gli ODL (uno per riga)
        await app.getByRole('button', { name: 'Inserisci OdM' }).click();

        // 3) Ricerca
        passo = `ricerca-${cognome}`;
        await app.getByRole('button', { name: 'Ricerca' }).click();
        await page.waitForLoadState('networkidle').catch(() => {});
        // conferma che almeno il primo ODL dell'operatore sia nei risultati
        await app.getByRole('row', { name: new RegExp(String(ordini[0].odl)) }).first()
          .waitFor({ state: 'visible', timeout: 25_000 });
        await shot(`trovato-${cognome}`);

        if (dryRun) {
          for (const o of ordini) esiti.push({ odl: o.odl, esito: 'simulato', motivo: `dry-run (${operatore}, ${ordini.length} ODL trovati)` });
          continue;
        }

        // 4) assegna l'operatore a ciascun ODL dei risultati (senza ri-cercare)
        for (const o of ordini) {
          let p2 = `apri-${o.odl}`;
          try {
            const riga = app.getByRole('row', { name: new RegExp(String(o.odl)) }).first();
            await riga.waitFor({ state: 'visible', timeout: 20_000 });
            await riga.click();
            await app.getByRole('button', { name: 'Modificare' }).click();

            p2 = `risorse-${o.odl}`;
            await app.getByText('Definizione risorse').click();
            await app.locator('[id$="addDipendenteFromDefinizioneRisorseSingle"]').click();

            p2 = `seleziona-${o.odl}`;
            const rigaDialogo = app.getByRole('row', { name: new RegExp(cognome, 'i') }).first();
            await rigaDialogo.waitFor({ state: 'visible', timeout: 20_000 });
            const checkbox = rigaDialogo.getByRole('checkbox').first();
            if (await checkbox.isVisible().catch(() => false)) await checkbox.check();
            else await rigaDialogo.click();
            await app.getByRole('button', { name: 'Ok' }).click();

            p2 = `teamleader-${o.odl}`;
            await app.getByRole('row', { name: new RegExp(cognome, 'i') }).getByLabel('Team Leader').click();

            p2 = `salva-${o.odl}`;
            await app.getByRole('button', { name: 'Salva' }).click();
            await app.getByRole('button', { name: 'OK' }).click();
            await page.waitForLoadState('networkidle').catch(() => {});
            await shot(`ok-${o.odl}`);
            esiti.push({ odl: o.odl, esito: 'assegnato' });
          } catch (e) {
            await shot(`errore-${p2}`);
            esiti.push({ odl: o.odl, esito: 'fallito', motivo: `passo "${p2}": ${e instanceof Error ? e.message : String(e)}` });
          }
        }
      } catch (e) {
        await shot(`errore-${passo}`);
        for (const o of ordini) esiti.push({ odl: o.odl, esito: 'fallito', motivo: `passo "${passo}": ${e instanceof Error ? e.message : String(e)}` });
      }
    }
    return { esiti };
  } finally {
    await browser.close();
  }
}
