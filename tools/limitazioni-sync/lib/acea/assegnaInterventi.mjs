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
import fs from 'node:fs';
import path from 'node:path';
import { apriCruscotto } from './driver.mjs';

// Log append per-ODL (NDJSON): traccia OGNI tentativo SUBITO su disco, indipendente dal report finale
// (robusto a crash / inviaReport fallito). Una riga per esito → dataset per gli errori più comuni.
// Estrae il "passo" dal motivo per categorizzare al volo. Best-effort: non deve MAI bloccare il giro.
function appendEsitoLog(acea, stamp, r, esito, motivo) {
  try {
    const dir = acea?.debug || acea?.download || '.';
    fs.mkdirSync(dir, { recursive: true });
    const passo = (/passo "([^"]+)"/.exec(String(motivo ?? '')) || [])[1] || null;
    const riga = { ts: new Date().toISOString(), stamp, odl: r?.odl ?? null, operatore: r?.operatoreAcea ?? null, esito, passo, motivo: motivo ?? null };
    fs.appendFileSync(path.join(dir, 'acea-assegna-esiti.ndjson'), JSON.stringify(riga) + '\n', 'utf8');
  } catch { /* best-effort: il log non deve mai bloccare l'assegnazione */ }
}

// L'`esecutore`/operatoreAcea del master è GIÀ solo il COGNOME, anche COMPOSTO ("DE SANTIS",
// "DI MARCO", "LA ROSA"). NON spezzare alla prima parola: per "DE SANTIS" darebbe "DE" → la regex
// /DE/i (case-insensitive) matcha "de" ovunque (Ad-de-tto, qualifiche, descrizioni) e rompe SIA la
// selezione nella modale SIA il ciclo Team Leader (ogni riga sembra "l'operatore"). Si usa il cognome
// INTERO con spazi normalizzati, così il match resta preciso ("DE SANTIS" → /DE SANTIS/i).
const cognomeDa = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

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
async function processaOdl({ app, page, shot, tornaAlForm, r, dryRun, contratto, scala = 1 }) {
  const cognome = cognomeDa(r.operatoreAcea);
  // Pazienza: moltiplica i tempi d'attesa (config acea.attesaScala) quando ACEA è lenta a renderizzare.
  // Alzare un timeout NON rallenta gli ODL che vanno a buon fine: l'attesa finisce appena l'elemento c'è.
  const T = (ms) => Math.round(ms * scala);
  let passo = `form-${r.odl}`;
  try {
    // 0) torna al form di ricerca
    await tornaAlForm();
    await app.getByRole('button', { name: 'Ricerca' }).first().waitFor({ state: 'visible', timeout: T(30_000) });

    // 1) Contratto: fill se editabile (form fresco lo "attiva"); se disabilitato è già impostato
    passo = `contratto-${r.odl}`;
    try {
      const c = app.getByRole('textbox', { name: /Contratto/i }).first();
      if (contratto && await c.isEditable().catch(() => false)) {
        await c.fill(String(contratto));
        await c.press('Enter');
        await app.getByText('PLENZICH', { exact: false }).first().waitFor({ state: 'visible', timeout: T(15_000) }).catch(() => {});
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
    await inputModale.waitFor({ state: 'visible', timeout: T(20_000) });
    await inputModale.click();
    await inputModale.fill(String(r.odl));
    await app.getByRole('button', { name: 'Inserisci OdM' }).click();

    // 4) Ricerca → individua la riga
    passo = `ricerca-${r.odl}`;
    await app.getByRole('button', { name: 'Ricerca' }).first().click();
    await page.waitForLoadState('networkidle').catch(() => {});
    const rigaLavoro = app.getByRole('row', { name: new RegExp(String(r.odl)) }).first();
    await rigaLavoro.waitFor({ state: 'visible', timeout: T(25_000) });
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
    // SAP carica il pannello in modo ASINCRONO: la scheda può restare vuota un attimo (è la causa
    // dei fallimenti intermittenti "inserisci"/"seleziona" anche quando l'operatore C'È). Clicca la
    // scheda, attendi il caricamento, e RIPROVA se il bottone "Inserire" non compare.
    const btnInserire = app.locator('[id$="addDipendenteFromDefinizioneRisorseSingle"]').first();
    const btnModificaEdit = app.getByRole('button', { name: 'Modificare' }).first();
    let pannelloPronto = false;
    for (let t = 0; t < 3 && !pannelloPronto; t++) {
      // GARANZIA modalità modifica: "Modificare" è il tasto che abilita la modifica e l'inserimento
      // operatori. Se è ANCORA visibile, il click iniziale NON ha scattato (ACEA lenta) → la scheda
      // resta in SOLA LETTURA e "Inserire" non comparirà mai. Ri-clicca finché entra in modifica.
      if (await btnModificaEdit.isVisible().catch(() => false)) {
        await btnModificaEdit.click().catch(() => {});
        const bloccoRetry = await rilevaBlocco(app);
        if (bloccoRetry) return { bloccato: true, odl: r.odl, motivo: bloccoRetry };
        await page.waitForLoadState('networkidle').catch(() => {});
      }
      await app.getByText('Definizione risorse').first().click().catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      pannelloPronto = await btnInserire.isVisible().catch(() => false);
      if (!pannelloPronto) await page.waitForTimeout(T(1500));
    }
    if (!pannelloPronto) throw new Error('scheda "Definizione risorse" non caricata (Modificare/Inserire non scattati)');

    // L'operatore è GIÀ nella griglia Dipendenti? (es. già assegnato): in tal caso non è tra i
    // "Dipendenti disponibili" della modale → niente aggiunta, solo Team Leader.
    let giaPresente = false;
    try {
      await app.getByRole('row', { name: new RegExp(`Team Leader.*${cognome}`, 'i') }).first()
        .waitFor({ state: 'visible', timeout: T(6_000) });
      giaPresente = true;
    } catch { giaPresente = false; }

    if (!giaPresente) {
      passo = `inserisci-${r.odl}`;
      await btnInserire.waitFor({ state: 'visible', timeout: T(15_000) }); // il pannello può ri-renderizzarsi: ri-conferma
      await btnInserire.click();

      passo = `seleziona-${r.odl}`;
      // La modale "Selezione dipendenti" carica la lista in modo ASINCRONO e VIRTUALIZZA le righe
      // (solo quelle a schermo sono nel DOM). L'operatore C'È sempre, ma può stare sopra o sotto la
      // schermata iniziale. Quindi: attendi che la lista sia popolata, RIPARTI DALL'ALTO, poi scorri
      // a PICCOLI passi controllando a ogni passo (i falsi "non trovato"/timeout su seleziona-* nascono
      // dal cercare su lista non ancora caricata e dallo scroll grossolano solo verso il basso).
      const tabella = app.locator('#tableSelezioneDipendenti');
      await tabella.waitFor({ state: 'visible', timeout: T(20_000) });
      await tabella.locator('[id*="-rowsel"]').first().waitFor({ state: 'visible', timeout: T(15_000) }).catch(() => {});
      const rigaDialogo = tabella.getByRole('row', { name: new RegExp(cognome, 'i') }).first();
      const box = await tabella.boundingBox().catch(() => null);
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      // riparti dall'alto: l'operatore può essere SOPRA la posizione iniziale della lista
      for (let s = 0; s < 25; s++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(60); }
      let visibile = await rigaDialogo.isVisible().catch(() => false);
      for (let s = 0; s < 120 && !visibile; s++) {
        await page.mouse.wheel(0, 80); // passo piccolo: non saltare righe
        await page.waitForTimeout(90);
        visibile = await rigaDialogo.isVisible().catch(() => false);
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
      await app.locator('#tableSelezioneDipendenti').waitFor({ state: 'hidden', timeout: T(10_000) }).catch(() => {});
      await app.getByRole('row', { name: new RegExp(cognome, 'i') }).first()
        .waitFor({ state: 'visible', timeout: T(20_000) });
    }

    // REGOLA: l'operatore dev'essere l'UNICO Team Leader.
    // Caso critico "ODL già assegnato a un ALTRO operatore" (il destinatario di oggi è diverso da chi
    // c'è già): vanno fatte due cose nell'ORDINE giusto → 1) togliere il flag Team Leader al/ai
    // vecchio/i operatore/i; 2) spuntare come Team Leader il nuovo operatore. Altrimenti restano DUE
    // Team Leader e SAP blocca il Salva con "Selezionare un solo Team Leader".
    // NON filtriamo le righe per accessible-name "Team Leader": quel nome NON lo contiene sempre (vedi
    // commento sopra) → la riga del vecchio operatore sfuggiva al ciclo e restava TL. Prendiamo invece
    // TUTTE le righe della griglia Dipendenti = quelle che ESPONGONO il checkbox "Team Leader".
    passo = `teamleader-${r.odl}`;
    let modificato = !giaPresente;
    let righeDip = app.getByRole('row').filter({ has: app.getByLabel('Team Leader') });
    let nR = await righeDip.count();
    if (nR === 0) { // fallback difensivo: vecchia strategia (righe col nome che contiene "Team Leader")
      righeDip = app.getByRole('row', { name: /Team Leader/ });
      nR = await righeDip.count();
    }
    // 1) togli il flag Team Leader a TUTTI gli operatori che NON sono il destinatario
    for (let i = 0; i < nR; i++) {
      const riga = righeDip.nth(i);
      const testo = (await riga.textContent().catch(() => '')) ?? '';
      if (!testo.trim()) continue;                        // riga senza dati (header/placeholder): salta
      if (new RegExp(cognome, 'i').test(testo)) continue; // è il nuovo operatore: lo gestiamo al passo 2
      const box = riga.getByLabel('Team Leader').first();
      if (await box.isChecked().catch(() => false)) { await box.click(); modificato = true; }
    }
    // 2) spunta come Team Leader il nuovo operatore (destinatario di oggi), se non già spuntato
    for (let i = 0; i < nR; i++) {
      const riga = righeDip.nth(i);
      const testo = (await riga.textContent().catch(() => '')) ?? '';
      if (!new RegExp(cognome, 'i').test(testo)) continue;
      const box = riga.getByLabel('Team Leader').first();
      if (!(await box.isChecked().catch(() => false))) { await box.click(); modificato = true; }
      break; // un solo destinatario
    }

    // 6) Salva → dopo può comparire l'OK di conferma (successo) o l'errore "ordine bloccato"
    passo = `salva-${r.odl}`;
    await app.getByRole('button', { name: 'Salva' }).click();
    const bloccoSalva = await rilevaBlocco(app);
    if (bloccoSalva) return { bloccato: true, odl: r.odl, motivo: bloccoSalva };
    if (modificato) await app.getByRole('button', { name: 'OK' }).click({ timeout: T(15_000) });
    else await app.getByRole('button', { name: 'OK' }).click({ timeout: T(6_000) }).catch(() => {});
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

/** Orchestrazione dei giri di assegnazione: sessioni fresche a BLOCCHI + ritentativi.
 *  `runGiro(lista)` esegue UN giro in una sessione propria e ritorna `{ fatti, daRitentare:[{r,motivo}] }`.
 *  Recupero su due livelli (sempre in una sessione FRESCA):
 *   - cascata: gli ODL rimandati dal giro (form perso / sessione chiusa / ordine bloccato) → ritentati;
 *   - flake di passo: un `fallito` di passo intermedio (pannello "Definizione risorse" non caricato,
 *     scroll della modale dipendenti, ecc.) è spesso intermittente → UN ritentativo prima di darlo
 *     per perso (es. lo stesso operatore va a buon fine in un'altra sessione).
 *  Niente Playwright qui dentro → testabile con un runGiro finto. */
export async function orchestraAssegnazioni(righe, runGiro, { chunk = 20, maxPassi = 8, stopDopoFermi = 2 } = {}) {
  const esiti = [];
  if (!Array.isArray(righe) || righe.length === 0) return { esiti };
  const giaRitentato = new Set(); // odl 'fallito' a cui è già stato concesso il ritentativo
  let pending = righe.map((r) => ({ r, motivo: null }));
  let fermi = 0;
  for (let passo = 0; passo < maxPassi && pending.length; passo++) {
    const prossimo = [];
    let chiusi = 0; // esiti definitivi prodotti in questo passo (= "progresso")
    for (let i = 0; i < pending.length; i += chunk) {
      const blocco = pending.slice(i, i + chunk);
      const byOdl = new Map(blocco.map((x) => [String(x.r.odl), x.r]));
      const esito = (await runGiro(blocco.map((x) => x.r))) ?? {};
      const fatti = Array.isArray(esito.fatti) ? esito.fatti : [];
      const daRitentare = Array.isArray(esito.daRitentare) ? esito.daRitentare : [];
      for (const e of fatti) {
        const key = String(e.odl);
        if (e.esito === 'fallito' && !giaRitentato.has(key) && byOdl.has(key)) {
          giaRitentato.add(key); // un solo ritentativo per ODL → niente loop
          prossimo.push({ r: byOdl.get(key), motivo: e.motivo });
        } else {
          esiti.push(e);
          chiusi++;
        }
      }
      for (const x of daRitentare) prossimo.push(x);
    }
    fermi = chiusi === 0 ? fermi + 1 : 0;
    pending = prossimo;
    if (fermi >= stopDopoFermi) break;
  }
  for (const x of pending) {
    esiti.push({ odl: x.r.odl, esito: 'non assegnato', motivo: x.motivo || 'non recuperabile dopo ritentativi' });
  }
  return { esiti };
}

export async function assegnaInterventi(acea, righe, { stamp = 'manual', dryRun = true } = {}) {
  if (!Array.isArray(righe) || righe.length === 0) return { esiti: [] };

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
          const res = await processaOdl({ app, page, shot, tornaAlForm, r, dryRun, contratto: acea.ricerca?.contratto, scala: acea.attesaScala ?? 1.5 });
          if (res?.bloccato) { daRitentare.push({ r, motivo: res.motivo }); appendEsitoLog(acea, stamp, r, 'bloccato', res.motivo); }
          else { fatti.push(res); appendEsitoLog(acea, stamp, r, res?.esito ?? '?', res?.motivo ?? null); }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await shot(`errore-${r.odl}`).catch(() => {});
          // Sessione inutilizzabile per gli ODL SUCCESSIVI → rimanda QUESTO e i restanti a una
          // sessione FRESCA (è la causa della cascata di fallimenti "form-*"):
          //  - "has been closed": browser/sessione morto;
          //  - fallimento allo step "form": la maschera di ricerca non è più tornata (tornaAlForm
          //    non ha recuperato) → ogni ODL seguente fallirebbe a catena allo stesso punto.
          const sessionePersa = /has been closed/i.test(msg);
          const formPerso = /passo "form-/.test(msg);
          if (sessionePersa || formPerso) {
            const motivo = formPerso ? 'maschera di ricerca persa: sessione rinfrescata' : 'sessione interrotta, da ritentare';
            appendEsitoLog(acea, stamp, r, 'rimandato', `${motivo} :: ${msg}`);
            for (let j = k; j < lista.length; j++) daRitentare.push({ r: lista[j], motivo });
            break;
          }
          fatti.push({ odl: r.odl, esito: 'fallito', motivo: msg });
          appendEsitoLog(acea, stamp, r, 'fallito', msg);
        }
      }
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
    return { fatti, daRitentare };
  };

  // Sessioni fresche a BLOCCHI + ritentativo finché si fa progresso (orchestraAssegnazioni):
  // blocchi piccoli = niente degrado da sessione di ore; "form perso"/sessione chiusa/ordine
  // bloccato → i restanti a una sessione fresca; chiudere il browser libera i lock auto-inflitti.
  return orchestraAssegnazioni(righe, eseguiGiro, { chunk: acea?.assegna?.chunk ?? 20 });
}
