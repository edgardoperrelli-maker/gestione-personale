# Riepilogo rapportini — rivisitazione del modulo

**Data:** 2026-06-05
**Stato:** Design approvato (in attesa di review utente) — *implementazione rimandata: altri task in corso*
**Tipo:** Redesign UX + logica generazione + export

---

## 1. Contesto

Il "modulo riepilogo rapportini" comprende **due viste**:

- **A — Lista riepilogo**: [`components/modules/mappa/RiepilogoRapportini.tsx`](../../../components/modules/mappa/RiepilogoRapportini.tsx), montata in `/hub/mappa?vista=riepilogo`. Carica da `GET /api/mappa/rapportini/riepilogo` e raggruppa con [`utils/rapportini/groupByDay.ts`](../../../utils/rapportini/groupByDay.ts).
- **B — Vista contenuto** del singolo rapportino: [`app/hub/rapportini/contenuto/[id]/page.tsx`](../../../app/hub/rapportini/contenuto/[id]/page.tsx), con tabella interventi. Stessa logica colonne usata dall'export Excel [`lib/rapportini/exportStandard.ts`](../../../lib/rapportini/exportStandard.ts).

### Problemi attuali

1. **Nessun filtro.** La lista carica sempre una finestra fissa `[oggi−30gg, oggi+14gg]` (i parametri `from`/`to` esistono nell'API ma il frontend non li usa) e mostra tutto in un'unica colonna verticale.
2. **Raggruppamento per `piano_id`, non per territorio.** Due piani sullo stesso territorio nello stesso giorno producono **due card** con lo stesso nome territorio. Il territorio è solo un'etichetta dentro la card del piano.
3. **Duplicati operatore non gestiti.** La deduplica in generazione ([`genera/route.ts`](../../../app/api/mappa/rapportini/genera/route.ts)) è per `(piano_id, staff_id)`: lo stesso operatore può avere **due rapportini** sullo stesso territorio/giorno se generati da piani diversi, senza alcun avviso.
4. **Vista contenuto piena di colonne vuote.** La tabella mostra tutte le colonne anagrafiche e i campi del template anche quando sono interamente "—".

---

## 2. Obiettivi e non-obiettivi

### Obiettivi
- Filtri sulla lista riepilogo (Periodo, Territorio, Operatore, Stato, ricerca).
- Raggruppamento per **Giorno → Territorio** (una sola card per territorio/giorno; i piani multipli confluiscono).
- Alla **generazione dalla mappa**, rilevare i duplicati `(territorio, operatore, giorno)` cross-piano e chiedere conferma di sovrascrittura (**Sostituisci / salta**).
- Nascondere le **colonne non popolate** sia nella vista contenuto sia nell'export Excel.

### Non-obiettivi (YAGNI)
- Nessun toggle di raggruppamento commutabile (approccio B) né tabella densa (approccio C): scartati a favore di A.
- Nessuna azione di merge/spostamento manuale dei rapportini dal riepilogo: il riepilogo resta di **consultazione** (più filtri).
- Nessuna modifica allo schema DB / nessuna migrazione SQL.
- Nessuna modifica al flusso di compilazione operatore (`/r/[token]`).

---

## 3. Decisioni di design (confermate)

| Tema | Decisione |
|------|-----------|
| Layout lista | **A** — Giorno → Territorio + barra filtri |
| Azioni di piano in card multi-piano | **Mini-header per piano** (Riapri/Elimina sul sotto-header; con un solo piano stanno sull'header territorio) |
| Quando scatta la sovrascrittura | **Alla generazione dalla mappa** (riepilogo resta in sola lettura) |
| Semantica conflitto | **Sostituisci / salta** (sì = elimina il vecchio e crea il nuovo; no = lascia il vecchio, non genera) |
| Granularità conferma | **Globale** (Sovrascrivi tutti / Salta tutti) **+ inviati protetti** (conferma extra esplicita) |
| Colonne vuote | Nascoste in **vista web + export Excel**, via utility condivisa; colonna indice (`#` / `ORDINE`) sempre presente |

---

## 4. Architettura

### Area 1 — Vista Riepilogo (A)

**Dati / filtri**
- **Periodo** → lato server, usando i parametri `from`/`to` già presenti nell'API riepilogo. Preset: Oggi, ultimi 7 gg, ultimi 30 gg (default attuale), personalizzato.
- **Territorio / Operatore / Stato / ricerca** → lato client sui dati caricati (volume contenuto). Stato = chip multi-selezione (Inviato / In corso / Scaduto). Ricerca testuale su nome operatore e indirizzo.

**Raggruppamento** — nuova utility pura `utils/rapportini/groupByDayTerritory.ts`:
- Struttura: `Giorno[] → { data, territori: Territorio[] }`, dove `Territorio = { chiave, etichetta, piani: Piano[], nOperatori }` e `Piano = { piano_id, creato_at, operatori: RapRiepilogo[] }`.
- Chiave di raggruppamento territorio = **stringa normalizzata** (trim + confronto case-insensitive) per non separare "CORCIANO" da "Corciano "; l'etichetta mostrata è quella originale prevalente.
- Territorio `null`/vuoto → raggruppato sotto "Senza territorio" (card a sé, mai unito ad altri).
- Ordinamento: giorni desc; territori per etichetta asc; piani per `creato_at` asc.
- *(L'API riepilogo deve restituire anche `piano_creato_at` per ordinare/etichettare i piani — vedi §5.)*

**Componenti** — refactor di `RiepilogoRapportini.tsx` in unità piccole e isolate:
- `FiltriRiepilogo` — barra filtri (stato dei filtri sollevato nel contenitore).
- `CardTerritorio` — header territorio (+ conteggio); se `piani.length > 1` rende i `MiniHeaderPiano`, altrimenti azioni piano nell'header.
- `MiniHeaderPiano` — etichetta piano (`PIANO · creato HH:MM`) + azioni `Riapri` / `Elimina`.
- `RigaOperatore` — nome, badge stato, n° interventi, azioni (Copia link, WhatsApp, Vedi, Excel, Rimuovi).

### Area 2 — Sovrascrittura in generazione

**Flusso preflight a due fasi** su `POST /api/mappa/rapportini/genera`:

1. La UI chiama la generazione (come oggi: `{ pianoId, templateId }`).
2. L'API calcola i **conflitti** prima di scrivere: per ogni operatore del piano corrente, esiste un rapportino con **stesso territorio (normalizzato) + stessa data + stesso `staff_id`** su un **piano diverso** da quello corrente?
   - La deduplica esistente per **stesso piano** resta invariata (rigenerare lo stesso piano non è un conflitto).
   - Territorio `null`/vuoto → **mai** conflitto.
3. **Nessun conflitto** → l'API procede come oggi (nessuna interruzione, retro-compatibile).
4. **Conflitti presenti** → l'API **non scrive** e risponde `409` con `{ conflicts: [{ staff_id, staff_name, territorio, data, piano_id_esistente, submitted }] }`, dove `submitted = true` se il rapportino esistente è inviato/compilato (`submitted_at` non null o `stato = 'inviato'`).
5. La UI mostra un **dialog di conferma**: elenco operatori in conflitto; quelli con `submitted = true` evidenziati con avviso ("sovrascrivere cancella i dati già compilati") e una **spunta esplicita obbligatoria** per includerli. Pulsanti: **Sovrascrivi tutti** / **Salta tutti** / Annulla.
6. La UI richiama l'API con `{ pianoId, templateId, overwrite: 'replace' | 'skip' }`:
   - `replace` → per ogni operatore in conflitto, **elimina** il rapportino esistente sull'altro piano (+ voci a cascata), poi genera il nuovo nel piano corrente.
   - `skip` → non genera per gli operatori in conflitto, lascia intatti gli esistenti; genera normalmente per gli altri.

**Rilevamento conflitti** — utility pura `utils/rapportini/rilevaConflitti.ts`, testabile in isolamento (riceve operatori del piano + rapportini candidati, ritorna l'elenco conflitti). La route si limita alle query e all'orchestrazione.

### Area 3 — Colonne vuote (web + Excel)

**Utility condivisa** `utils/rapportini/colonneVisibili.ts` (pura, testabile):
- `campoHaValore(tipo, val)`: per `crocetta` → `val === true`; altri tipi → `val != null && String(val).trim() !== ''`.
- `colonneVisibili(info, campi, voci)` → `{ info: TemplateInfoCampo[], campi: TemplateCampo[] }` filtrati:
  - una colonna **info** è visibile se almeno una voce ha `valoreInfo(v, chiave)` non vuoto;
  - una colonna **campo** è visibile se almeno una voce ha `campoHaValore(tipo, risposte[chiave])`.

**Consumatori**
- `app/hub/rapportini/contenuto/[id]/page.tsx`: calcola `colonneVisibili(...)` e itera solo su quelle (header e celle). La colonna `#` resta sempre.
- `lib/rapportini/exportStandard.ts` (`buildRapportinoXlsx`): usa la stessa utility per costruire `headers` e celle. La colonna `ORDINE` resta sempre. Il calcolo larghezze e la pulizia celle residue si adeguano al numero di colonne effettive.
- Caso limite: tutte le colonne vuote → resta solo `#`/`ORDINE` (la vista mostra comunque la riga "Nessun intervento" se `voci.length === 0`).

---

## 5. Contratti dati / API

- `GET /api/mappa/rapportini/riepilogo`
  - **Invariato** nel filtraggio temporale (`from`/`to`), ma il frontend ora passa `from`/`to` secondo il preset Periodo.
  - **Aggiunta**: ogni elemento include `piano_creato_at` (dal `created_at` di `mappa_piani`) per ordinare/etichettare i piani nelle card multi-piano.
- `POST /api/mappa/rapportini/genera`
  - **Input**: `{ pianoId, templateId, overwrite?: 'replace' | 'skip' }`.
  - **Output conflitto** (quando `overwrite` assente e ci sono conflitti): `409 { conflicts: [...] }`.
  - **Output ok**: invariato (`{ ok, rapportini, interventiWarning }`).
- Nessuna modifica di schema; nessuna migrazione SQL.

---

## 6. Gestione errori / casi limite

- **Nessun conflitto** → comportamento identico a oggi (zero attriti).
- **Territorio mancante** → non genera conflitti; card "Senza territorio" separata.
- **Rapportino esistente già inviato** → protetto: richiede spunta esplicita prima della sovrascrittura.
- **Filtri che azzerano i risultati** → stato vuoto dedicato ("Nessun rapportino per i filtri selezionati").
- **Normalizzazione territorio** → differenze di maiuscole/spazi non creano card o conflitti spuri.

---

## 7. Testing

Unità pure, coperte da test (coerente con TDD del progetto):
- `groupByDayTerritory`: unione piani stesso territorio/giorno; normalizzazione chiave; "Senza territorio"; ordinamenti.
- `rilevaConflitti`: conflitto cross-piano stesso territorio/data/operatore; esclusione stesso piano; esclusione territorio null; flag `submitted`.
- `colonneVisibili` + `campoHaValore`: info popolate/vuote; crocette spuntate/non; tipi testuali; caso "tutte vuote".

Verifica manuale: lista con filtri; card multi-piano; dialog sovrascrittura (replace/skip, con e senza inviati); vista contenuto e Excel con colonne ridotte.

> Nota lint: `npm run lint` è già rosso su main (errori preesistenti). Il gate è "nessun nuovo problema dai file toccati" — verificare con `npx eslint <path>`.

---

## 8. File toccati (stima)

**Nuovi**
- `utils/rapportini/groupByDayTerritory.ts` (+ test)
- `utils/rapportini/rilevaConflitti.ts` (+ test)
- `utils/rapportini/colonneVisibili.ts` (+ test)
- Sotto-componenti: `FiltriRiepilogo`, `CardTerritorio`, `MiniHeaderPiano`, `RigaOperatore` (cartella `components/modules/mappa/riepilogo/`)
- Dialog conferma sovrascrittura (componente in area mappa)

**Modificati**
- `components/modules/mappa/RiepilogoRapportini.tsx` (refactor a contenitore + filtri)
- `app/api/mappa/rapportini/riepilogo/route.ts` (aggiunge `piano_creato_at`)
- `app/api/mappa/rapportini/genera/route.ts` (preflight conflitti + `overwrite`)
- `components/modules/mappa/MappaOperatoriClient.tsx` (`generaRapportini` → gestione 409 + dialog)
- `app/hub/rapportini/contenuto/[id]/page.tsx` (colonne visibili)
- `lib/rapportini/exportStandard.ts` (colonne visibili)

---

## 9. Aperti / da decidere in fase di piano
- Etichetta dei piani nel mini-header: `creato HH:MM` vs indice progressivo (`Piano 1/2`). Default proposto: orario di creazione.
- Default del preset Periodo all'apertura: ultimi 30 gg (come oggi).
