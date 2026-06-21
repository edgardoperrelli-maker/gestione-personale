// tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs
// Driver Playwright di SCRITTURA: per ogni ODL lo cerca nel Cruscotto e assegna l'operatore.
// Selettori SAP UI5 instabili → locatori per ruolo/etichetta/testo.
//
// Flusso reale (dal codegen + screenshot ACEA):
//   apriCruscotto → attiva il form (Contratto + "Escludi ODM chiusi" OFF) UNA volta →
//   per ogni ODL:
//     1) campo "Numero OdM" → dialog "Ricerca: Numero OdM" → "Svuota tabella" → digita ODL → "Inserisci OdM"
//     2) "Ricerca" → individua la riga del lavoro
//     (dry-run: si ferma qui, NON apre/salva)
//     3) apri la riga → "Modificare" → "Definizione risorse" → aggiungi dipendente
//     4) seleziona l'operatore per COGNOME → "Ok" → spunta "Team Leader" → "Salva" → "OK"
import { apriCruscotto } from './driver.mjs';

const cognomeDa = (s) => String(s ?? '').trim().split(/\s+/)[0] || '';

export async function assegnaInterventi(acea, righe, { stamp = 'manual', dryRun = true } = {}) {
  const esiti = [];
  if (!Array.isArray(righe) || righe.length === 0) return { esiti };

  const { browser, page, app, shot } = await apriCruscotto(acea, { stamp });
  try {
    // ── attiva il form UNA volta: Contratto (precompilato, ma il fill "attiva" i filtri) + ODM chiusi OFF
    try {
      const ric = acea.ricerca ?? {};
      const contratto = app.getByRole('textbox', { name: /Contratto/i }).first();
      if (ric.contratto) {
        await contratto.fill(String(ric.contratto));
        await contratto.press('Enter');
        await app.getByText('PLENZICH', { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
      }
      // "Escludi ODM chiusi" SEMPRE OFF (per includere anche i chiusi/completati)
      const sw = app.getByRole('switch', { name: /Escludi ODM chiusi/i }).first();
      if (await sw.isVisible().catch(() => false)) {
        const acceso = await sw.getAttribute('aria-checked').catch(() => null);
        if (acceso === 'true') await sw.click();
      }
      await shot('form-attivo');
    } catch { /* best effort: il form potrebbe essere già attivo */ }

    for (const r of righe) {
      let passo = `cerca-${r.odl}`;
      try {
        // 1) campo "Numero OdM" → apre il dialog "Ricerca: Numero OdM"
        const cellaOdM = app.getByRole('gridcell', { name: 'Numero OdM' }).getByLabel('Numero OdM').first();
        await cellaOdM.waitFor({ state: 'visible', timeout: 30_000 });
        await cellaOdM.click();

        // dialog: svuota la tabella, digita l'ODL nella riga, conferma con "Inserisci OdM".
        // Fallback: se il dialog non compare, prova a digitare inline nel campo + Enter.
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

        // 2) Ricerca
        passo = `ricerca-${r.odl}`;
        await app.getByRole('button', { name: 'Ricerca' }).click();
        await page.waitForLoadState('networkidle').catch(() => {});

        // individua la riga del lavoro per numero ODL
        const rigaLavoro = app.getByRole('row', { name: new RegExp(String(r.odl)) }).first();
        await rigaLavoro.waitFor({ state: 'visible', timeout: 20_000 });
        await shot(`trovato-${r.odl}`);

        if (dryRun) {
          // dry-run: NON tocca il portale, verifica solo che l'ODL sia individuabile.
          esiti.push({ odl: r.odl, esito: 'simulato', motivo: 'dry-run (riga trovata, non salvato)' });
          continue;
        }

        // 3) apri in modifica
        passo = `apri-${r.odl}`;
        await rigaLavoro.click();
        await app.getByRole('button', { name: 'Modificare' }).click();

        // 4) scheda "Definizione risorse" → aggiungi dipendente
        passo = `risorse-${r.odl}`;
        await app.getByText('Definizione risorse').click();
        await app.locator('[id$="addDipendenteFromDefinizioneRisorseSingle"]').click();

        // 5) seleziona l'operatore per COGNOME (la lista non ha ricerca: Playwright scrolla alla riga)
        passo = `seleziona-${r.odl}`;
        const cognome = cognomeDa(r.operatoreAcea);
        if (!cognome) throw new Error('cognome operatore vuoto');
        const rigaDialogo = app.getByRole('row', { name: new RegExp(cognome, 'i') }).first();
        await rigaDialogo.waitFor({ state: 'visible', timeout: 20_000 });
        const checkbox = rigaDialogo.getByRole('checkbox').first();
        if (await checkbox.isVisible().catch(() => false)) await checkbox.check();
        else await rigaDialogo.click();
        await app.getByRole('button', { name: 'Ok' }).click(); // 'Ok' del dialog (≠ 'OK' finale)

        // 6) spunta "Team Leader" sulla riga dell'operatore (sempre)
        passo = `teamleader-${r.odl}`;
        await app.getByRole('row', { name: new RegExp(cognome, 'i') }).getByLabel('Team Leader').click();

        // 7) salva
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
