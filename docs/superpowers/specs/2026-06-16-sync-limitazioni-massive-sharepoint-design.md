# Aggiornamento automatico del file ACEA limitazioni massive su SharePoint

**Data:** 2026-06-16
**Stato:** Design in revisione

## Contesto e obiettivo
Le limitazioni massive affidate in pianificazione vivono in un file Excel ACEA (export grezzo SAP)
nello SharePoint aziendale, **un file per comune** (oggi solo `ZAGAROLO (1).xlsx`, nella cartella
`…/8_LAVORI/LIMITAZIONI MASSIVE`). L'ufficio oggi lo aggiorna **a mano** ogni giorno: segna chi/quando/come
sono stati lavorati gli ODL.

Vogliamo che l'app aggiorni quel file **da sola, ogni sera (21:00)** alla "chiusura dei rapportini":
1. **Righe pianificate** — per gli ODL lavorati, scrivere esito (eseguito/No), esecutore, data e sigillo.
2. **Interventi manuali (extra)** — le limitazioni lavorate nell'app che non corrispondono a nessuna riga
   pianificata vanno **aggiunte in fondo** al file del loro comune.

I dati esistono già tutti in DB: ogni limitazione lavorata (anche quelle nate dal "+" manuale) finisce nella
tabella canonica `interventi` con `odl`, `matricola_contatore`, `esito`, `sigillo_numero`, `staff_id`, `chiuso_at`,
`comune`, `indirizzo` (vedi `richiestaToIntervento.ts` e `20260602000000_interventi_acea.sql`).

## Verdetto di fattibilità: ✅ fattibile, nessun ostacolo bloccante
- **Accesso al file senza IT/Azure:** il file è sincronizzato come **cartella OneDrive locale** sul PC di lavoro.
  Un programma locale ci scrive dentro e OneDrive sincronizza su SharePoint con l'utenza già loggata.
- **Aggancio solido:** chiave **ODL** (col F = `interventi.odl`), riserva **matricola** (col I = `matricola_contatore`).
- **Scrittura mirata:** solo le colonne dell'ufficio (BM, BN, BO, BQ); mai le colonne ACEA (A→BL).

### Limiti accettati (esplicitati con l'utente)
- Il PC deve essere **acceso e loggato** alle 21:00; se è spento, la riconciliazione recupera la sera dopo.
- Se qualcuno tiene il **file aperto** al momento della scrittura, l'agente salta e riprova al giro successivo.
- L'automazione **dipende da quel singolo PC** (l'alternativa cloud "sempre attiva" richiederebbe l'IT/Azure).

### Validazioni sul campo (2026-06-16)
Verificato direttamente sul **PC di lavoro** e sul file campione:
- **Node portable** (`v24.16.0`, zip senza admin) **gira** → nessun criterio aziendale (AppLocker/WDAC) lo blocca.
- **Cartella SharePoint raggiungibile** dal percorso reale; l'agente vede i file.
- **`exceljs` round-trip fedele**: riscrivendo il file ACEA, 2020 righe × 73 colonne restano identiche, le scritture
  BM/BN/BO/BQ vanno a segno, le "icone" della col A sono **testo** (non immagini) → nessuna perdita di formato.
- **Attenzione (nuovo):** la cartella può contenere **anche file non-master** (trovato un export
  `INTERVENTI_<date>.xlsx` accanto a `ZAGAROLO.xlsx`). L'agente deve selezionare i master **per firma di colonne**, vedi sotto.

## Architettura

```
   App (Vercel + Supabase)
   └─ nuovo endpoint protetto  GET /api/export/limitazioni-massive
                │  HTTPS + segreto condiviso  →  JSON delle limitazioni lavorate (campi già tradotti)
                ▼
   PC di lavoro (Utilità di pianificazione Windows, 21:00)
   └─ Agente locale Node.js
        1. chiede all'app i lavori della finestra (ultimi 15 gg)
        2. scorre i *.xlsx nella cartella OneDrive "LIMITAZIONI MASSIVE"
        3. aggancia ogni lavoro alla riga (ODL → matricola), per comune
        4. backup datato del file → scrive SOLO BM/BN/BO/BQ (celle vuote)
        5. aggiunge in fondo gli interventi manuali "extra"
        6. salva → OneDrive sincronizza → log del giro
                ▼
   SharePoint aziendale (gli altri vedono il file aggiornato)
```

Due componenti nuovi: **A) endpoint cloud** (logica dati) e **B) agente locale** (lettura/scrittura Excel).

## Componente A — Endpoint cloud `GET /api/export/limitazioni-massive`
- **Auth:** header con **segreto condiviso** (es. `x-export-key`) confrontato con una env var. Nessun login utente.
- **Query param:** `from`, `to` (default: ultimi 15 giorni). Riconciliazione idempotente, non "solo oggi".
- **Filtro interventi:** solo le limitazioni massive. *(Da confermare in build: il discriminante esatto —
  `intervento_tipo`/activity = 'LIMITAZIONI MASSIVE' oppure il committente del censito; vedi "Da confermare".)*
- **Output JSON** (una riga per intervento lavorato/chiuso), con i campi **già tradotti per il file**:
  ```jsonc
  {
    "odl": "912231020",
    "matricola": "20000020750",
    "comune": "ZAGAROLO",
    "via": "VIA CANCELLATA GRANDE 32",
    "esecutore": "CIARALLO",          // cognome operatore
    "data_esecuzione": "2026-06-03",  // da chiuso_at
    "esito": "eseguito",              // "eseguito" | "No"  (vedi mappatura)
    "esito_motivo": "accesso negato", // solo per il log quando esito = "No"
    "sigillo": "AA728566"
  }
  ```
- **Risoluzione sigillo:** l'endpoint legge il sigillo dalla fonte corretta *(da confermare in build:
  campo del template nella voce `risposte` vs colonna `interventi.sigillo_numero`)* e lo normalizza.
- Tutta la logica "intelligente" (mappatura esiti, sigillo, cognome esecutore) sta **qui**, così il DB resta
  nel cloud e l'agente sul PC tiene solo il segreto.

## Componente B — Agente locale Node.js
File standalone (nel repo sotto `tools/limitazioni-sync/`, copiato sul PC). Runtime: **Node.js portable**
(zip estratto in cartella utente, **senza admin** — verificato v24.16.0). Usa `exceljs`.
**Distribuzione:** si spedisce l'agente **con il suo `node_modules` già dentro** (preparato qui dove `npm` funziona),
così sul PC di lavoro **non serve `npm install`** (utile se il proxy aziendale blocca il registry).

**Configurazione** (file `config.json` accanto all'agente, non versionato):
```jsonc
{
  "endpointUrl": "https://<app>/api/export/limitazioni-massive",
  "exportKey": "••••",
  "cartella": "C:/Users/edgardo.perrelli/Plenzich s.p.a/Commesse - Documenti/…/LIMITAZIONI MASSIVE",
  "finestraGiorni": 15,
  "dryRun": true   // prime esecuzioni: NON salva, produce solo il report
}
```

**Passi di un giro:**
1. `GET` all'endpoint con il segreto → elenco lavori della finestra.
2. Elenca i `*.xlsx` della cartella (esclude `_backup/` e file temporanei `~$…`). **Seleziona solo i file-master**:
   un file è valido solo se la sua intestazione contiene la **firma di colonne ACEA** (ORDINE, MATRICOLA, esito,
   sigillo posato). Gli altri `.xlsx` presenti (es. export `INTERVENTI_<date>.xlsx`) vengono **ignorati e annotati nel log**.
3. Per ogni file: carica con `exceljs`, **trova la riga di intestazione** e mappa le colonne **per nome**
   (alias: "ORDINE"→odl, "MATRICOLA"→matricola, "Esecutore", "data prevista", "esito",
   "sigillo posato", "Località"→comune, "Via"/"INDIRIZZO"). Robusto a spostamenti di colonna ACEA.
4. Determina il **comune del file** (dalla colonna Località prevalente, fallback: nome file).
5. Per ogni lavoro di quel comune: aggancia per **ODL** esatto, altrimenti per **matricola** esatta.
6. **Scrive** secondo le regole (sotto). Le righe agganciate vengono "consumate".
7. I lavori del comune **non agganciati** a nessuna riga → **append** in fondo come extra.
8. I lavori di comuni **senza file** → finiscono nel report come "non collocati" (non persi).
9. `_backup/<file>__YYYYMMDD-HHmm.xlsx` **prima** di salvare; poi salva; poi scrive il log del giro.

## Regole di aggancio e scrittura

**Colonne scritte dall'app** (solo se la cella è **vuota** — policy prudente):
| Col | Campo | Valore |
|-----|-------|--------|
| BM | Esecutore | cognome operatore |
| BN | data | data esecuzione (`chiuso_at`) |
| BO | esito | `"eseguito"` se positivo · `"No"` se negativo |
| BQ | sigillo posato | numero sigillo |

**Mai toccate:** A→BL (export ACEA), **BP** (saracinesca), **BR** (stato odl, riservata all'utente).

**Semantica esito (BO):**
- riga lavorata, esito positivo (`eseguito_positivo`) → **"eseguito"**
- riga lavorata, esito negativo (accesso negato, matricola non trovata, non fatto, ecc.) → **"No"**
  (il motivo specifico va **nel log**, non nel file)
- riga **non ancora lavorata** → **vuota** (l'app non la tocca)

**Policy di sovrascrittura (prudente):** scrive solo nelle celle **vuote**. Se una cella BM/BN/BO/BQ è già
compilata a mano con un valore **diverso**, **non la tocca** e annota il conflitto nel log per verifica umana.

**Interventi manuali "extra"** (lavoro che non aggancia nessuna riga pianificata del comune):
- riga nuova in fondo al file del comune, con: matricola (col I), via (col Via/INDIRIZZO), esecutore (BM),
  data (BN), esito (BO), sigillo (BQ);
- marcatore **"AGGIUNTA APP"** in una colonna libera (**BS**) per distinguerle a colpo d'occhio;
- extra di un comune **senza file** → elencati nel report "non collocati".

## Sicurezza e robustezza
- **Dry-run** iniziale: l'agente gira ma **non salva**, produce solo il report "ecco cosa scriverei". Si abilitano
  le scritture solo dopo che l'utente ha verificato un paio di report.
- **Backup datato** di ogni file prima di ogni modifica (`_backup/`).
- **File aperto/lock:** se il salvataggio fallisce (file aperto in Excel, lock OneDrive), l'agente **salta** quel
  file, lo annota e riprova al giro successivo. La riconciliazione idempotente garantisce il recupero.
- **Idempotenza:** riscrivere lo stesso valore non cambia nulla → giri ripetuti e finestra di 15 giorni sono sicuri.
- **Log del giro** (file `log/YYYYMMDD-HHmm.txt` + opzionale POST di riepilogo all'app): righe aggiornate,
  extra aggiunte, conflitti, non collocati, file saltati.

## Prerequisiti operativi (passi manuali una tantum)
- Node.js **portable** (zip, nessun admin) sul PC di lavoro — *verificato 2026-06-16: v24.16.0 gira senza blocchi*.
- File della libreria SharePoint **sincronizzato** come cartella locale (già confermato).
- `config.json` compilato (percorso cartella, URL endpoint, segreto).
- Env var del segreto impostata sull'app (Vercel).
- **Attività pianificata** Windows alle 21:00 che lancia `node agente.js`.

## Da confermare in fase di build (dettagli, non ostacoli)
1. **Fonte del sigillo:** campo del template nella voce `risposte` oppure `interventi.sigillo_numero`.
2. **Discriminante "limitazione massiva"** sugli `interventi` (committente mappato ad `acea` +
   `intervento_tipo`/activity = 'LIMITAZIONI MASSIVE'; cfr. `20260612120000_committente_lim_massive_checks.sql`).
3. **Formato cognome esecutore** (`staff`) allineato a com'è scritto in col BM (maiuscolo, solo cognome).
4. **Diciture esatte** se in futuro servisse più del binario eseguito/No.

## Testing
- **Funzioni pure (vitest):** normalizzazione/aggancio ODL e matricola; rilevazione colonne per intestazione;
  mappatura esito → "eseguito"/"No"; individuazione "extra"; policy celle vuote/conflitto.
- **Excel read/write:** su una **copia fixture** di `ZAGAROLO (1).xlsx` (mai sul file reale nei test).
- **Endpoint:** test con `interventi` di esempio (positivi, negativi, manuali, comune assente).
- **Campo:** prima esecuzione in **dry-run** sulla cartella reale → verifica report → poi scritture attive.

## Fuori scope
- Integrazione Microsoft Graph / app Azure (alternativa cloud, non scelta).
- Scrittura delle colonne ACEA A→BL e delle colonne riservate BP/BR.
- Comuni/file diversi dalla struttura "un file per comune" (estendibile se cambia).
- Modifiche al flusso operatore o alla Lista Attesa (l'app resta invariata; leggiamo solo i dati esistenti).
