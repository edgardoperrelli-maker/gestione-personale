// tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs
// Driver Playwright di SCRITTURA: assegna gli ODL agli operatori sul Cruscotto ACEA, UN ODL alla volta.
// Locatori dal codegen reale (alcuni id auto __input1/__button8 sono stabili su questa app).
//
// Flusso reale (codegen), PER OGNI ODL:
//   apriCruscotto → poi:
//     0) "Nuova ricerca" se siamo sui risultati (torna al form)
//     1) value-help Contratto (__input1-vhi) → seleziona il contratto → ABILITA il form
//     2) "Escludi ODM chiusi" OFF
//     3) ">" della riga Numero OdM (__button8) → modale → "Svuota tabella" → scrivi 1 ODL → "Inserisci OdM"
//     4) "Ricerca" → individua la riga   (dry-run: si ferma qui)
//     5) apri la riga → "Modificare" → "Definizione risorse" → aggiungi dipendente →
//        seleziona operatore per COGNOME → "Ok" → "Team Leader" → "Salva" → "OK"
import { apriCruscotto } from './driver.mjs';

const cognomeDa = (s) => String(s ?? '').trim().split(/\s+/)[0] || '';
const CONTRATTO_TXT = 'Gestione utenze idriche morose'; // descrizione contratto nel value-help

export async function assegnaInterventi(acea, righe, { stamp = 'manual', dryRun = true } = {}) {
  const esiti = [];
  if (!Array.isArray(righe) || righe.length === 0) return { esiti };

  const { browser, page, app, shot } = await apriCruscotto(acea, { stamp });

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
        // 0) torna al form di ricerca
        await vaiAlForm();
        await app.getByRole('button', { name: 'Ricerca' }).first().waitFor({ state: 'visible', timeout: 30_000 });

        // 1) value-help Contratto → seleziona (abilita il form). __input1-vhi = icona value-help del Contratto.
        passo = `contratto-${r.odl}`;
        const vhContratto = app.locator('[id="__input1-vhi"]').first();
        if (await vhContratto.isVisible().catch(() => false)) {
          await vhContratto.click();
          await app.getByText(CONTRATTO_TXT, { exact: false }).first().click({ timeout: 15_000 });
          await page.waitForLoadState('networkidle').catch(() => {});
        }

        // 2) "Escludi ODM chiusi" OFF
        passo = `switch-${r.odl}`;
        const sw = app.getByRole('switch', { name: 'Escludi ODM chiusi' }).first();
        if (await sw.isVisible().catch(() => false)) {
          const on = await sw.isChecked().catch(() => null);
          if (on === true) await sw.click().catch(() => {});
        }

        // 3) apri il modale Numero OdM col ">" (__button8), svuota, scrivi l'ODL, Inserisci OdM
        passo = `cerca-${r.odl}`;
        await app.locator('[id="__button8"]').first().click();
        await app.getByRole('button', { name: 'Svuota tabella' }).click().catch(() => {});
        const campo = app.getByRole('gridcell', { name: 'Numero OdM' }).getByLabel('Numero OdM').last();
        await campo.waitFor({ state: 'visible', timeout: 15_000 });
        await campo.click();
        await campo.fill(String(r.odl));
        await app.getByRole('button', { name: 'Inserisci OdM' }).click();

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
