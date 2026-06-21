// tools/limitazioni-sync/lib/acea/assegnaInterventi.mjs
// Driver Playwright di SCRITTURA: assegna gli ODL agli operatori sul Cruscotto ACEA, UN ODL alla volta.
// Locatori dal codegen reale (alcuni id auto __input1/__button8 sono stabili su questa app).
//
// Flusso reale (codegen), PER OGNI ODL:
//   apriCruscotto → poi:
//     0) "Nuova ricerca" se siamo sui risultati (torna al form)
//     1) value-help Contratto (__input1-vhi) → seleziona il contratto → ABILITA il form
//     2) "Escludi ODM chiusi" OFF
//     3) modale OdM (__button8) → scrivi l'ODL nel campo (NO "Svuota tabella") → "Inserisci OdM"
//     4) "Ricerca" → individua la riga   (dry-run: si ferma qui)
//     5) apri la riga (cella stato, non il link Ordine) → "Modificare" → "Definizione risorse" →
//        se l'operatore NON è già presente: "Inserire" → seleziona per COGNOME → "Ok";
//        poi operatore = UNICO Team Leader → "Salva" → "OK"
import { apriCruscotto } from './driver.mjs';

const cognomeDa = (s) => String(s ?? '').trim().split(/\s+/)[0] || '';

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

        // 1) Contratto: fill se editabile (form fresco lo "attiva"); se disabilitato è già impostato
        passo = `contratto-${r.odl}`;
        try {
          const contratto = app.getByRole('textbox', { name: /Contratto/i }).first();
          if (acea.ricerca?.contratto && await contratto.isEditable().catch(() => false)) {
            await contratto.fill(String(acea.ricerca.contratto));
            await contratto.press('Enter');
            await app.getByText('PLENZICH', { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
          }
        } catch { /* già impostato */ }

        // 2) "Escludi ODM chiusi" OFF
        passo = `switch-${r.odl}`;
        const sw = app.getByRole('switch', { name: 'Escludi ODM chiusi' }).first();
        if (await sw.isVisible().catch(() => false)) {
          const on = await sw.isChecked().catch(() => null);
          if (on === true) await sw.click().catch(() => {});
        }

        // 3) Modale "Numero OdM" (NO "Svuota tabella"): apri la tabella OdM, scrivi l'ODL nell'unico
        //    campo (il sistema accetta anche più ODL su righe multiple e li divide per riga), poi
        //    "Inserisci OdM". Fedele al codegen reale. "Nuova ricerca" a inizio giro azzera già la
        //    tabella → svuotarla è inutile e rompeva "Inserisci OdM".
        passo = `cerca-${r.odl}`;
        await app.locator('[id="__button8"]').first().click();
        // campo del modale OdM: prima la cella della griglia (codegen), fallback al textbox del dialog
        const cellaOdl = app.getByRole('gridcell', { name: 'Numero OdM' }).getByLabel('Numero OdM').first();
        const inputModale = (await cellaOdl.isVisible().catch(() => false))
          ? cellaOdl
          : app.getByRole('textbox', { name: 'Numero OdM' }).last();
        await inputModale.waitFor({ state: 'visible', timeout: 20_000 });
        await inputModale.click();
        await inputModale.fill(String(r.odl));
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

        // 5) apri in modifica e assegna l'operatore  (locatori dal codegen reale Fase 2)
        passo = `apri-${r.odl}`;
        // apri la riga cliccando la cella "Descrizione Stato Ordine" (col1) DENTRO la riga dell'ODL:
        // NON la riga intera, perché la colonna "Ordine" è un link che navigherebbe altrove.
        const cellaApri = rigaLavoro.locator('[id*="-col1"]').first();
        if (await cellaApri.isVisible().catch(() => false)) await cellaApri.click();
        else await app.locator('[id$="tableLavoriPubblicati-rows-row0-col1"]').first().click();
        await app.getByRole('button', { name: 'Modificare' }).click();

        passo = `risorse-${r.odl}`;
        await app.getByText('Definizione risorse').first().click();
        // assicurati che la sezione Dipendenti sia caricata (bottone "Inserire" presente)
        const btnInserire = app.locator('[id$="addDipendenteFromDefinizioneRisorseSingle"]');
        await btnInserire.waitFor({ state: 'visible', timeout: 20_000 });

        // L'operatore è GIÀ nella griglia Dipendenti? (es. già assegnato a questo lavoro). In tal caso
        // NON compare tra i "Dipendenti disponibili" della modale: niente aggiunta, solo Team Leader.
        let giaPresente = false;
        try {
          await app.getByRole('row', { name: new RegExp(`Team Leader.*${cognome}`, 'i') }).first()
            .waitFor({ state: 'visible', timeout: 6_000 });
          giaPresente = true;
        } catch { giaPresente = false; }

        if (!giaPresente) {
          passo = `inserisci-${r.odl}`;
          await btnInserire.click();

          passo = `seleziona-${r.odl}`;
          // modale "Selezione dipendenti": seleziona la riga per COGNOME (scoped alla tabella del dialog)
          const rigaDialogo = app.locator('#tableSelezioneDipendenti')
            .getByRole('row', { name: new RegExp(cognome, 'i') }).first();
          await rigaDialogo.waitFor({ state: 'visible', timeout: 20_000 });
          await rigaDialogo.click();
          await app.getByRole('button', { name: 'Ok' }).click();
          // attendi che l'operatore compaia nella griglia Dipendenti
          await app.getByRole('row', { name: new RegExp(`Team Leader.*${cognome}`, 'i') }).first()
            .waitFor({ state: 'visible', timeout: 20_000 });
        }

        // REGOLA: l'operatore dev'essere l'UNICO Team Leader. Per riga: spunta l'operatore, togli la
        // spunta agli altri. Traccio se ho cambiato qualcosa (per la conferma di salvataggio).
        passo = `teamleader-${r.odl}`;
        let modificato = !giaPresente; // se ho appena aggiunto l'operatore è già una modifica
        const righeTL = app.getByRole('row', { name: /Team Leader/ });
        const nR = await righeTL.count();
        for (let i = 0; i < nR; i++) {
          const riga = righeTL.nth(i);
          const testo = (await riga.textContent().catch(() => '')) ?? '';
          const isOp = new RegExp(cognome, 'i').test(testo);
          const box = riga.getByLabel('Team Leader').first();
          const checked = await box.isChecked().catch(() => false);
          if (isOp && !checked) { await box.click(); modificato = true; }       // spunta l'operatore
          else if (!isOp && checked) { await box.click(); modificato = true; }  // togli gli altri
        }

        passo = `salva-${r.odl}`;
        await app.getByRole('button', { name: 'Salva' }).click();
        // l'OK di conferma compare su un salvataggio reale; se non c'erano modifiche può non comparire
        if (modificato) await app.getByRole('button', { name: 'OK' }).click();
        else await app.getByRole('button', { name: 'OK' }).click({ timeout: 8_000 }).catch(() => {});
        await page.waitForLoadState('networkidle').catch(() => {});
        await shot(`ok-${r.odl}`);
        esiti.push({
          odl: r.odl,
          esito: 'assegnato',
          motivo: giaPresente
            ? (modificato ? 'operatore già presente; Team Leader aggiornato' : 'operatore già presente e Team Leader corretto')
            : undefined,
        });
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
