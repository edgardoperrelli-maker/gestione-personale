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
  const ric = acea.ricerca ?? {};

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

        // 1) Contratto: se il campo è editabile (form fresco) lo "attiva" con fill+Enter; se è
        //    disabilitato (già selezionato) si salta. NIENTE value-help / id auto (instabili).
        passo = `contratto-${cognome}`;
        try {
          const contratto = app.getByRole('textbox', { name: /Contratto/i }).first();
          if (ric.contratto && await contratto.isEditable().catch(() => false)) {
            await contratto.fill(String(ric.contratto));
            await contratto.press('Enter');
            await app.getByText('PLENZICH', { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
          }
        } catch { /* contratto già impostato */ }

        // 2) "Escludi ODM chiusi" OFF
        passo = `switch-${cognome}`;
        const sw = app.getByRole('switch', { name: /Escludi ODM chiusi/i }).first();
        if (await sw.isVisible().catch(() => false)) {
          const on = await sw.isChecked().catch(() => null);
          if (on === true) await sw.click().catch(() => {});
        }

        // 3) apri il modale "Numero OdM" col pulsante ">" della sua riga (id auto ma stabile su questa app)
        passo = `cerca-${cognome}`;
        const svuota = app.getByRole('button', { name: 'Svuota tabella' });
        const apriModale = app.locator('[id="__button8"]').first();
        if (await apriModale.isVisible().catch(() => false)) {
          await apriModale.click();
        }
        // fallback: se il modale non si è aperto, prova a cliccare il campo "Numero OdM"
        if (!(await svuota.isVisible().catch(() => false))) {
          await app.getByRole('gridcell', { name: 'Numero OdM' }).getByLabel('Numero OdM').first().click().catch(() => {});
        }
        await svuota.waitFor({ state: 'visible', timeout: 15_000 });
        await svuota.click().catch(() => {});
        // campo del dialog: può essere input/combobox/MultiInput → provo più locatori, primo visibile
        const elenco = ordini.map((o) => String(o.odl)).join('\n');
        const candidati = [
          app.locator('.sapMDialog input:visible').last(),
          app.getByRole('combobox', { name: 'Numero OdM' }).last(),
          app.getByRole('textbox', { name: 'Numero OdM' }).last(),
          app.getByLabel('Numero OdM').last(),
        ];
        let inpDlg = null;
        for (const c of candidati) {
          if (await c.isVisible().catch(() => false)) { inpDlg = c; break; }
        }
        if (!inpDlg) inpDlg = candidati[0];
        await inpDlg.waitFor({ state: 'visible', timeout: 15_000 });
        await inpDlg.click();
        // INCOLLA reale (clipboard + Ctrl+V): non scatena Invio, il controllo splitta le righe
        // come quando si incolla a mano (il fill multilinea invece auto-submitteva il modale).
        await page.evaluate((t) => navigator.clipboard.writeText(t), elenco);
        await page.keyboard.press('Control+V');
        await page.waitForTimeout(400);
        // conferma con "Inserisci OdM" (tollerante: a volte il paste già popola le righe)
        await app.getByRole('button', { name: 'Inserisci OdM' }).last().click({ timeout: 20_000 }).catch(() => {});

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
