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
//
// Robustezza "ordine bloccato": se SAP risponde che l'ordine è bloccato da un utente (lock di una
// sessione precedente), l'ODL viene RIMANDATO. A fine giro si ritenta in una sessione FRESCA (chiudere
// il primo browser rilascia i lock auto-inflitti). Se ancora bloccato → esito "non assegnato".
import { apriCruscotto } from './driver.mjs';

const cognomeDa = (s) => String(s ?? '').trim().split(/\s+/)[0] || '';

/** Se è aperto il dialog "L'ordine … è attualmente bloccato dall'utente …": lo chiude e ritorna il
 *  testo dell'errore. Altrimenti ritorna null. Attende fino a 3s perché compaia dopo Modificare/Salva. */
async function rilevaBlocco(app) {
  const dlg = app.getByText(/attualmente bloccato dall'utente/i).first();
  try {
    await dlg.waitFor({ state: 'visible', timeout: 3_000 });
  } catch {
    return null;
  }
  const testo = ((await dlg.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
  await app.getByRole('button', { name: 'Chiudi' }).first().click().catch(() => {});
  return testo || 'ordine bloccato';
}

/** Processa UN ODL nella sessione corrente.
 *  Ritorna un esito {odl,esito,motivo} OPPURE {bloccato:true,odl,motivo} se l'ordine è bloccato.
 *  Lancia (con "passo …" nel messaggio) sugli altri errori; se la sessione è morta il messaggio
 *  contiene "has been closed" → il chiamante rimanda l'ODL a un giro fresco. */
async function processaOdl({ app, page, shot, tornaAlForm, r, dryRun, contratto }) {
  const cognome = cognomeDa(r.operatoreAcea);
  let passo = `form-${r.odl}`;
  try {
    // 0) torna al form di ricerca
    await tornaAlForm();
    await app.getByRole('button', { name: 'Ricerca' }).first().waitFor({ state: 'visible', timeout: 30_000 });

    // 1) Contratto: fill se editabile (form fresco lo "attiva"); se disabilitato è già impostato
    passo = `contratto-${r.odl}`;
    try {
      const c = app.getByRole('textbox', { name: /Contratto/i }).first();
      if (contratto && await c.isEditable().catch(() => false)) {
        await c.fill(String(contratto));
        await c.press('Enter');
        await app.getByText('PLENZICH', { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
      }
    } catch { /* già impostato */ }

    // 2) "Escludi ODM chiusi" OFF
    passo = `switch-${r.odl}`;
    const sw = app.getByRole('switch', { name: 'Escludi ODM chiusi' }).first();
    if (await sw.isVisible().catch(() => false)) {
      if (await sw.isChecked().catch(() => null) === true) await sw.click().catch(() => {});
    }

    // 3) modale "Numero OdM" (NO "Svuota tabella"): apri, scrivi l'ODL, "Inserisci OdM"
    passo = `cerca-${r.odl}`;
    await app.locator('[id="__button8"]').first().click();
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

    if (dryRun) return { odl: r.odl, esito: 'simulato', motivo: 'dry-run (riga trovata, non salvato)' };

    // 5) apri in modifica  (cella stato col1 DENTRO la riga; NON il link Ordine)
    passo = `apri-${r.odl}`;
    const cellaApri = rigaLavoro.locator('[id*="-col1"]').first();
    if (await cellaApri.isVisible().catch(() => false)) await cellaApri.click();
    else await app.locator('[id$="tableLavoriPubblicati-rows-row0-col1"]').first().click();
    await app.getByRole('button', { name: 'Modificare' }).click();
    // l'ordine può essere bloccato da una sessione precedente: compare appena si entra in modifica
    const bloccoEdit = await rilevaBlocco(app);
    if (bloccoEdit) return { bloccato: true, odl: r.odl, motivo: bloccoEdit };

    passo = `risorse-${r.odl}`;
    await app.getByText('Definizione risorse').first().click();
    const btnInserire = app.locator('[id$="addDipendenteFromDefinizioneRisorseSingle"]');
    await btnInserire.waitFor({ state: 'visible', timeout: 20_000 });

    // L'operatore è GIÀ nella griglia Dipendenti? (es. già assegnato): in tal caso non è tra i
    // "Dipendenti disponibili" della modale → niente aggiunta, solo Team Leader.
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
      // La griglia "Selezione dipendenti" è VIRTUALIZZATA: solo le righe a schermo sono nel DOM,
      // quindi l'operatore può stare "sotto la prima schermata". Scorri (mouse wheel sulla tabella)
      // finché la riga col cognome compare, poi cliccala. (root cause del timeout su seleziona-*)
      const tabella = app.locator('#tableSelezioneDipendenti');
      await tabella.waitFor({ state: 'visible', timeout: 20_000 });
      const rigaDialogo = tabella.getByRole('row', { name: new RegExp(cognome, 'i') }).first();
      let visibile = await rigaDialogo.isVisible().catch(() => false);
      if (!visibile) {
        const box = await tabella.boundingBox().catch(() => null);
        if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        for (let s = 0; s < 40 && !visibile; s++) {
          await page.mouse.wheel(0, 320);
          await page.waitForTimeout(180);
          visibile = await rigaDialogo.isVisible().catch(() => false);
        }
      }
      if (!visibile) throw new Error(`operatore "${cognome}" non trovato nella lista Selezione dipendenti (scroll esaurito)`);
      // SELEZIONE: in sap.ui.table cliccare la cella DATI dà solo focus, NON seleziona la riga.
      // Va cliccata la CELLA SELETTORE (#...-rowselN) allineata verticalmente alla riga di GIOSI.
      const yRiga = (await rigaDialogo.boundingBox().catch(() => null))?.y ?? null;
      let selezionato = false;
      if (yRiga != null) {
        for (let i = 0; i < 40; i++) {
          const sel = app.locator(`#tableSelezioneDipendenti-rowsel${i}`);
          if (!(await sel.count())) break;
          const b = await sel.boundingBox().catch(() => null);
          if (b && Math.abs(b.y - yRiga) < 16) { await sel.click(); selezionato = true; break; }
        }
      }
      if (!selezionato) await rigaDialogo.click(); // fallback
      await app.getByRole('button', { name: 'Ok' }).click();
      // la modale si chiude e l'operatore appare nella griglia Dipendenti. Conferma per COGNOME:
      // il nome accessibile della riga non sempre contiene il testo "Team Leader" (colonna checkbox).
      await app.locator('#tableSelezioneDipendenti').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
      await app.getByRole('row', { name: new RegExp(cognome, 'i') }).first()
        .waitFor({ state: 'visible', timeout: 20_000 });
    }

    // REGOLA: l'operatore dev'essere l'UNICO Team Leader. Per riga: spunta l'operatore, togli gli altri.
    passo = `teamleader-${r.odl}`;
    let modificato = !giaPresente;
    const righeTL = app.getByRole('row', { name: /Team Leader/ });
    const nR = await righeTL.count();
    for (let i = 0; i < nR; i++) {
      const riga = righeTL.nth(i);
      const testo = (await riga.textContent().catch(() => '')) ?? '';
      const isOp = new RegExp(cognome, 'i').test(testo);
      const box = riga.getByLabel('Team Leader').first();
      const checked = await box.isChecked().catch(() => false);
      if (isOp && !checked) { await box.click(); modificato = true; }
      else if (!isOp && checked) { await box.click(); modificato = true; }
    }

    // 6) Salva → dopo può comparire l'OK di conferma (successo) o l'errore "ordine bloccato"
    passo = `salva-${r.odl}`;
    await app.getByRole('button', { name: 'Salva' }).click();
    const bloccoSalva = await rilevaBlocco(app);
    if (bloccoSalva) return { bloccato: true, odl: r.odl, motivo: bloccoSalva };
    if (modificato) await app.getByRole('button', { name: 'OK' }).click({ timeout: 15_000 });
    else await app.getByRole('button', { name: 'OK' }).click({ timeout: 6_000 }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(`ok-${r.odl}`);
    return {
      odl: r.odl,
      esito: 'assegnato',
      motivo: giaPresente
        ? (modificato ? 'operatore già presente; Team Leader aggiornato' : 'operatore già presente e Team Leader corretto')
        : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`passo "${passo}": ${msg}`);
  }
}

export async function assegnaInterventi(acea, righe, { stamp = 'manual', dryRun = true } = {}) {
  const esiti = [];
  if (!Array.isArray(righe) || righe.length === 0) return { esiti };

  // Esegue UN giro su `lista` in una sessione propria. Ritorna gli esiti chiusi (`fatti`) e gli ODL
  // da ritentare (`daRitentare`: bloccati o interrotti per sessione morta).
  const eseguiGiro = async (lista) => {
    const fatti = [];
    const daRitentare = [];
    let browser;
    try {
      const sess = await apriCruscotto(acea, { stamp });
      browser = sess.browser;
      const { page, app, shot } = sess;

      // Torna al form di ricerca da qualunque stato (lista o dettaglio), chiudendo eventuali dialog.
      const tornaAlForm = async () => {
        for (const nome of ['Chiudi', 'Annulla']) {
          const b = app.getByRole('button', { name: nome }).first();
          if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
        }
        let nuova = app.getByRole('button', { name: 'Nuova ricerca' }).first();
        if (!(await nuova.isVisible().catch(() => false))) {
          // probabilmente sul dettaglio: torna indietro per riportare i risultati (+ "Nuova ricerca")
          const indietro = app.getByRole('button', { name: /Indietro|Torna indietro|Back/i }).first();
          if (await indietro.isVisible().catch(() => false)) {
            await indietro.click().catch(() => {});
            await page.waitForLoadState('networkidle').catch(() => {});
            nuova = app.getByRole('button', { name: 'Nuova ricerca' }).first();
          }
        }
        if (await nuova.isVisible().catch(() => false)) {
          await nuova.click().catch(() => {});
          await page.waitForLoadState('networkidle').catch(() => {});
        }
      };

      for (let k = 0; k < lista.length; k++) {
        const r = lista[k];
        try {
          const res = await processaOdl({ app, page, shot, tornaAlForm, r, dryRun, contratto: acea.ricerca?.contratto });
          if (res?.bloccato) daRitentare.push({ r, motivo: res.motivo });
          else fatti.push(res);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await shot(`errore-${r.odl}`).catch(() => {});
          if (/has been closed/i.test(msg)) {
            // sessione morta: rimanda QUESTO e tutti i successivi a un giro fresco
            for (let j = k; j < lista.length; j++) daRitentare.push({ r: lista[j], motivo: 'sessione interrotta, da ritentare' });
            break;
          }
          fatti.push({ odl: r.odl, esito: 'fallito', motivo: msg });
        }
      }
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
    return { fatti, daRitentare };
  };

  // Giro 1
  const g1 = await eseguiGiro(righe);
  esiti.push(...g1.fatti);

  // Giro 2 (solo i rimandati): sessione FRESCA → libera i lock auto-inflitti dal giro 1
  if (g1.daRitentare.length) {
    const g2 = await eseguiGiro(g1.daRitentare.map((x) => x.r));
    esiti.push(...g2.fatti);
    for (const x of g2.daRitentare) {
      esiti.push({ odl: x.r.odl, esito: 'non assegnato', motivo: x.motivo || 'ordine bloccato' });
    }
  }

  return { esiti };
}
