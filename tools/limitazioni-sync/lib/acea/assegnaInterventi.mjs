// tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs
// Driver Playwright di SCRITTURA: assegna gli ODL agli operatori sul Cruscotto ACEA, UN ODL alla volta.
// Selettori SAP UI5 instabili → locatori per ruolo/etichetta/testo.
//
// Flusso reale (dal codegen + screenshot), PER OGNI ODL:
//   apriCruscotto → poi, per ogni ODL:
//     0) "Nuova ricerca" (reset al form: il portale ricorda l'ultima ricerca/risultati)
//     1) Contratto (se editabile, fill+Enter; se disabilitato è già selezionato) — abilita il form
//     2) "Escludi ODM chiusi" OFF
//     3) apri il modale "Numero OdM" col ">" della riga → "Svuota tabella" → scrivi 1 ODL → "Inserisci OdM"
//     4) "Ricerca" → individua la riga   (dry-run: si ferma qui)
//     5) apri la riga → "Modificare" → "Definizione risorse" → aggiungi dipendente →
//        seleziona l'operatore per COGNOME → "Ok" → "Team Leader" → "Salva" → "OK"
import { apriCruscotto } from './driver.mjs';

const cognomeDa = (s) => String(s ?? '').trim().split(/\s+/)[0] || '';

export async function assegnaInterventi(acea, righe, { stamp = 'manual', dryRun = true } = {}) {
  const esiti = [];
  if (!Array.isArray(righe) || righe.length === 0) return { esiti };

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
    for (const r of righe) {
      const cognome = cognomeDa(r.operatoreAcea);
      let passo = `form-${r.odl}`;
      try {
        // 0) reset al form + attendi prontezza (bottone "Ricerca")
        await vaiAlForm();
        await app.getByRole('button', { name: 'Ricerca' }).first().waitFor({ state: 'visible', timeout: 30_000 });
        await page.waitForLoadState('networkidle').catch(() => {});

        // 1) Contratto: fill se editabile (form fresco); se disabilitato è già selezionato
        passo = `contratto-${r.odl}`;
        try {
          const contratto = app.getByRole('textbox', { name: /Contratto/i }).first();
          if (ric.contratto && await contratto.isEditable().catch(() => false)) {
            await contratto.fill(String(ric.contratto));
            await contratto.press('Enter');
            await app.getByText('PLENZICH', { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
          }
        } catch { /* già impostato */ }

        // 2) "Escludi ODM chiusi" OFF
        passo = `switch-${r.odl}`;
        const sw = app.getByRole('switch', { name: /Escludi ODM chiusi/i }).first();
        if (await sw.isVisible().catch(() => false)) {
          const on = await sw.isChecked().catch(() => null);
          if (on === true) await sw.click().catch(() => {});
        }

        // 3) modale "Numero OdM": apri col ">" (__button8), svuota, scrivi 1 ODL, Inserisci OdM.
        //    Tutto SCOPATO dentro il dialog VISIBILE (.sapMDialog:visible): in DOM possono restare
        //    dialog nascosti di aperture precedenti → senza lo scope si prende il bottone sbagliato.
        passo = `cerca-${r.odl}`;
        const apriModale = app.locator('[id="__button8"]').first();
        if (await apriModale.isVisible().catch(() => false)) await apriModale.click();
        const dlg = app.locator('.sapMDialog:visible').last();
        const svuota = dlg.getByRole('button', { name: 'Svuota tabella' });
        if (!(await svuota.isVisible().catch(() => false))) {
          // fallback apertura: clic sul campo "Numero OdM" del form
          await app.getByRole('gridcell', { name: 'Numero OdM' }).getByLabel('Numero OdM').first().click().catch(() => {});
        }
        await svuota.waitFor({ state: 'visible', timeout: 15_000 });
        await svuota.click().catch(() => {});
        const inpDlg = dlg.locator('input:visible').last();
        await inpDlg.waitFor({ state: 'visible', timeout: 15_000 });
        await inpDlg.click();
        await inpDlg.fill(String(r.odl)); // UN solo ODL: niente multilinea, niente auto-submit
        await dlg.getByRole('button', { name: 'Inserisci OdM' }).click({ timeout: 20_000 });

        // 4) Ricerca → individua la riga
        passo = `ricerca-${r.odl}`;
        await app.getByRole('button', { name: 'Ricerca' }).first().click();
        await page.waitForLoadState('networkidle').catch(() => {});
        const rigaLavoro = app.getByRole('row', { name: new RegExp(String(r.odl)) }).first();
        await rigaLavoro.waitFor({ state: 'visible', timeout: 25_000 });
        await shot(`trovato-${r.odl}`);

        if (dryRun) {
          esiti.push({ odl: r.odl, esito: 'simulato', motivo: 'dry-run (riga trovata, non salvato)' });
          continue;
        }

        // 5) apri in modifica e assegna l'operatore
        passo = `apri-${r.odl}`;
        await rigaLavoro.click();
        await app.getByRole('button', { name: 'Modificare' }).click();

        passo = `risorse-${r.odl}`;
        await app.getByText('Definizione risorse').click();
        await app.locator('[id$="addDipendenteFromDefinizioneRisorseSingle"]').click();

        passo = `seleziona-${r.odl}`;
        const rigaDialogo = app.getByRole('row', { name: new RegExp(cognome, 'i') }).first();
        await rigaDialogo.waitFor({ state: 'visible', timeout: 20_000 });
        const checkbox = rigaDialogo.getByRole('checkbox').first();
        if (await checkbox.isVisible().catch(() => false)) await checkbox.check();
        else await rigaDialogo.click();
        await app.getByRole('button', { name: 'Ok' }).click();

        passo = `teamleader-${r.odl}`;
        await app.getByRole('row', { name: new RegExp(cognome, 'i') }).getByLabel('Team Leader').click();

        passo = `salva-${r.odl}`;
        await app.getByRole('button', { name: 'Salva' }).click();
        await app.getByRole('button', { name: 'OK' }).click();
        await page.waitForLoadState('networkidle').catch(() => {});
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
