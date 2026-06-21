// tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs
// Driver Playwright di SCRITTURA: per ogni ODL lo cerca nel Cruscotto e assegna l'operatore.
// Selettori SAP UI5 instabili → locatori per ruolo/etichetta/testo.
//
// Flusso reale (dal codegen + screenshot ACEA):
//   apriCruscotto → per ogni ODL:
//     0) "Nuova ricerca" (il portale ricorda l'ultima ricerca e al rientro mostra i RISULTATI:
//        questo riporta al FORM di ricerca pulito; vale anche da un ODL al successivo)
//     1) Contratto (precompilato; fill+Enter risolve il Fornitore) + "Escludi ODM chiusi" OFF
//     2) campo "Numero OdM" → dialog "Ricerca: Numero OdM" → "Svuota tabella" → digita ODL → "Inserisci OdM"
//     3) "Ricerca" → individua la riga del lavoro   (dry-run: si ferma qui)
//     4) apri la riga → "Modificare" → "Definizione risorse" → aggiungi dipendente
//     5) seleziona l'operatore per COGNOME → "Ok" → spunta "Team Leader" → "Salva" → "OK"
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
      let passo = `form-${r.odl}`;
      try {
        // 0) assicura il form di ricerca pulito (gestisce risultati persistiti + reset tra ODL)
        await vaiAlForm();

        // 1) Contratto (precompilato): un fill+Enter risolve il Fornitore e "attiva" i filtri
        const contratto = app.getByRole('textbox', { name: /Contratto/i }).first();
        await contratto.waitFor({ state: 'visible', timeout: 30_000 });
        if (ric.contratto) {
          await contratto.fill(String(ric.contratto));
          await contratto.press('Enter');
          await app.getByText('PLENZICH', { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
        }
        // "Escludi ODM chiusi" SEMPRE OFF
        const sw = app.getByRole('switch', { name: /Escludi ODM chiusi/i }).first();
        if (await sw.isVisible().catch(() => false)) {
          const on = await sw.isChecked().catch(() => null);
          if (on === true) await sw.click();
        }

        // 2) campo "Numero OdM" → dialog "Ricerca: Numero OdM"
        passo = `cerca-${r.odl}`;
        const cellaOdM = app.getByRole('gridcell', { name: 'Numero OdM' }).getByLabel('Numero OdM').first();
        await cellaOdM.waitFor({ state: 'visible', timeout: 30_000 });
        await cellaOdM.click();

        const svuota = app.getByRole('button', { name: 'Svuota tabella' });
        if (await svuota.isVisible().catch(() => false)) {
          await svuota.click().catch(() => {});
          const inp = app.getByRole('textbox', { name: 'Numero OdM' }).last();
          await inp.fill(String(r.odl));
          await inp.press('Enter').catch(() => {});
          await app.getByRole('button', { name: 'Inserisci OdM' }).click();
        } else {
          await cellaOdM.fill(String(r.odl));
          await cellaOdM.press('Enter');
        }

        // 3) Ricerca → individua la riga
        passo = `ricerca-${r.odl}`;
        await app.getByRole('button', { name: 'Ricerca' }).click();
        await page.waitForLoadState('networkidle').catch(() => {});
        const rigaLavoro = app.getByRole('row', { name: new RegExp(String(r.odl)) }).first();
        await rigaLavoro.waitFor({ state: 'visible', timeout: 20_000 });
        await shot(`trovato-${r.odl}`);

        if (dryRun) {
          esiti.push({ odl: r.odl, esito: 'simulato', motivo: 'dry-run (riga trovata, non salvato)' });
          continue;
        }

        // 4) apri in modifica
        passo = `apri-${r.odl}`;
        await rigaLavoro.click();
        await app.getByRole('button', { name: 'Modificare' }).click();

        // 5) "Definizione risorse" → aggiungi dipendente
        passo = `risorse-${r.odl}`;
        await app.getByText('Definizione risorse').click();
        await app.locator('[id$="addDipendenteFromDefinizioneRisorseSingle"]').click();

        // 6) seleziona l'operatore per COGNOME (la lista non ha ricerca: Playwright scrolla alla riga)
        passo = `seleziona-${r.odl}`;
        const cognome = cognomeDa(r.operatoreAcea);
        if (!cognome) throw new Error('cognome operatore vuoto');
        const rigaDialogo = app.getByRole('row', { name: new RegExp(cognome, 'i') }).first();
        await rigaDialogo.waitFor({ state: 'visible', timeout: 20_000 });
        const checkbox = rigaDialogo.getByRole('checkbox').first();
        if (await checkbox.isVisible().catch(() => false)) await checkbox.check();
        else await rigaDialogo.click();
        await app.getByRole('button', { name: 'Ok' }).click(); // 'Ok' del dialog (≠ 'OK' finale)

        // 7) spunta "Team Leader" sulla riga dell'operatore (sempre)
        passo = `teamleader-${r.odl}`;
        await app.getByRole('row', { name: new RegExp(cognome, 'i') }).getByLabel('Team Leader').click();

        // 8) salva
        passo = `salva-${r.odl}`;
        await app.getByRole('button', { name: 'Salva' }).click();
        await app.getByRole('button', { name: 'OK' }).click(); // conferma salvataggio
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
