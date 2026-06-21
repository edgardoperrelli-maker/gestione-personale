// tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs
// Driver Playwright di SCRITTURA: per ogni ODL apre la riga nel Cruscotto e assegna l'operatore.
// Selettori SAP UI5 instabili → locatori per ruolo/etichetta/testo + id con suffisso semantico
// (gli id tipo __button8 cambiano a ogni render; quelli "container-…--addDipendente…" sono stabili).
//
// Flusso reale (ricavato col Playwright codegen sul portale ACEA):
//   apriCruscotto (login + Cruscotto) → per ogni ODL:
//     1) cerca per "Numero OdM" → "Inserisci OdM" → "Ricerca"
//     2) apri la riga del lavoro → "Modificare"
//     3) scheda "Definizione risorse" → aggiungi dipendente
//     4) seleziona l'operatore per COGNOME nella lista (no ricerca: si scorre) → "Ok"
//     5) spunta "Team Leader" sulla riga dell'operatore (sempre)
//     6) "Salva" → "OK"
//
// Identità operatore: il master DUNNING ha il COGNOME; nella lista ACEA c'è la colonna cognome →
// si aggancia la riga per cognome (primo token di operatoreAcea, già passato per acea.operatori).
import { apriCruscotto } from './driver.mjs';

/** Cognome = primo token del nome operatore (display_name "COGNOME Nome"). */
const cognomeDa = (s) => String(s ?? '').trim().split(/\s+/)[0] || '';

export async function assegnaInterventi(acea, righe, { stamp = 'manual', dryRun = true } = {}) {
  const esiti = [];
  if (!Array.isArray(righe) || righe.length === 0) return { esiti };

  const { browser, page, app, shot } = await apriCruscotto(acea, { stamp });
  try {
    for (const r of righe) {
      let passo = `cerca-${r.odl}`;
      try {
        // 1) cerca l'ODL per "Numero OdM" (il campo è un multi-input: digita → Inserisci OdM → Ricerca)
        const campoOdM = app.getByRole('gridcell', { name: 'Numero OdM' }).getByLabel('Numero OdM');
        await campoOdM.click();
        await campoOdM.fill(String(r.odl));
        await campoOdM.press('Enter'); // committa il token
        // "Inserisci OdM" può non essere necessario se Enter già committa: best-effort.
        await app.getByRole('button', { name: 'Inserisci OdM' }).click().catch(() => {});
        await app.getByRole('button', { name: 'Ricerca' }).click();
        await page.waitForLoadState('networkidle').catch(() => {});

        // individua la riga del lavoro per numero ODL
        const rigaLavoro = app.getByRole('row', { name: new RegExp(String(r.odl)) }).first();
        await rigaLavoro.waitFor({ state: 'visible', timeout: 20_000 });
        await shot(`trovato-${r.odl}`);

        if (dryRun) {
          // dry-run: NON tocca il portale, verifica solo che l'ODL sia individuabile.
          esiti.push({ odl: r.odl, esito: 'simulato', motivo: 'dry-run (riga trovata, non salvato)' });
          await campoOdM.clear().catch(() => {}); // pulisci il filtro per il prossimo ODL
          continue;
        }

        // 2) apri in modifica
        passo = `apri-${r.odl}`;
        await rigaLavoro.click();
        await app.getByRole('button', { name: 'Modificare' }).click();

        // 3) scheda "Definizione risorse" → aggiungi dipendente
        passo = `risorse-${r.odl}`;
        await app.getByText('Definizione risorse').click();
        await app.locator('[id$="addDipendenteFromDefinizioneRisorseSingle"]').click();

        // 4) seleziona l'operatore per COGNOME (la lista non ha ricerca: Playwright scrolla alla riga)
        passo = `seleziona-${r.odl}`;
        const cognome = cognomeDa(r.operatoreAcea);
        if (!cognome) throw new Error('cognome operatore vuoto');
        const rigaDialogo = app.getByRole('row', { name: new RegExp(cognome, 'i') }).first();
        await rigaDialogo.waitFor({ state: 'visible', timeout: 20_000 });
        // spunta la casella di selezione della riga (fallback: click sulla riga)
        const checkbox = rigaDialogo.getByRole('checkbox').first();
        if (await checkbox.isVisible().catch(() => false)) await checkbox.check();
        else await rigaDialogo.click();
        await app.getByRole('button', { name: 'Ok' }).click(); // 'Ok' del dialog (≠ 'OK' finale)

        // 5) spunta "Team Leader" sulla riga dell'operatore (sempre)
        passo = `teamleader-${r.odl}`;
        await app.getByRole('row', { name: new RegExp(cognome, 'i') }).getByLabel('Team Leader').click();

        // 6) salva
        passo = `salva-${r.odl}`;
        await app.getByRole('button', { name: 'Salva' }).click();
        await app.getByRole('button', { name: 'OK' }).click(); // conferma salvataggio
        await page.waitForLoadState('networkidle').catch(() => {});
        await shot(`ok-${r.odl}`);
        esiti.push({ odl: r.odl, esito: 'assegnato' });

        await campoOdM.clear().catch(() => {}); // torna pronto per il prossimo ODL
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
