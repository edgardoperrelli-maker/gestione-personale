# Design — Riepilogo rapportini + Aggiungi manuale + Card colorate

- **Data:** 2026-06-01
- **Stato:** in attesa di revisione utente
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 · React 19 · Supabase · TypeScript · Tailwind 4 · xlsx · Vitest
- **Collegato a:** [Gestione pianificazioni & rapportini](2026-06-01-gestione-pianificazioni-rapportini-design.md) · [Fix dettagli/opzioni](2026-06-01-rapportino-dettagli-opzioni-fix-design.md)

---

## 1. Contesto e obiettivo

Tre migliorie al modulo mappa/rapportini, da spedire insieme:

- **A — Riepilogo rapportini:** una nuova vista che mostra gli stati di ogni operatore **raggruppati per giorno** (e per piano), con elimina/riapri come ora.
- **B — Aggiungi manuale:** nell'editor, accanto a "Aggiungi attività da template", un pulsante che apre una modale per inserire **a mano un intervento** con gli stessi campi dell'import.
- **C — Card colorate:** nel rapportino digitale, ogni card intervento diventa **verde** (esito positivo) o **rossa** (assente/negativo) una volta compilata, neutra se non ancora compilata.

Sono tre unità indipendenti; un solo spec/plan/deploy.

## 2. Decisioni (confermate)

| Tema | Scelta |
|---|---|
| A — raggruppamento | Giorno → Piano (territorio) → operatori. Riapri/Elimina sul piano, Rimuovi sull'operatore. |
| A — collocazione | Nuova vista `?vista=riepilogo` (3ª card), Registro invariato. |
| B — campi | Stessi dell'import (Export Dati) + Esecutore come select operatori. |
| C — colore | Auto: risposta NO/ASSENTE → rossa; altro esito compilato → verde; nessun esito → neutra (le sole note non contano). |

---

## 3. A — Riepilogo rapportini

### Collocazione
Nuova vista **`/hub/mappa?vista=riepilogo`** + 3ª card nella landing del modulo mappa ("Riepilogo rapportini"). `RegistroPianificazioni` resta com'è.

### Dati — nuova rotta `GET /api/mappa/rapportini/riepilogo`
Una chiamata, range date come i piani (default ~ -30/+14 gg, override `?from=&to=`):
1. `rapportini` nel range: `id, piano_id, staff_id, staff_name, data, stato, token, expires_at, submitted_at`.
2. territorio: join/lookup su `mappa_piani` (`id → territorio`) per i `piano_id` trovati (una query).
3. n° voci per rapportino: una query unica su `rapportino_voci` (`select rapportino_id where rapportino_id in (...)`), conteggio lato server (niente N+1).
4. Risponde una lista piatta: `{ id, piano_id, staff_id, staff_name, data, territorio, stato, statoCalcolato, url, token, nVoci, expires_at, submitted_at }` (`statoCalcolato` via `tokenStatus`, `url = ${NEXT_PUBLIC_SITE_URL}/r/<token>`).

### Logica pura — `utils/rapportini/groupByDay.ts` (+ test)
`groupRapportiniByDay(raps)` → `[{ data, piani: [{ piano_id, territorio, operatori: Rap[] }] }]`, giorni ordinati per `data` desc, piani per territorio. Test: raggruppa per data, separa più piani nello stesso giorno, ordina.

### UI — `components/modules/mappa/RiepilogoRapportini.tsx`
- Carica `GET /api/mappa/rapportini/riepilogo`, applica `groupRapportiniByDay`.
- Per ogni **giorno** (sezione con data): per ogni **piano** (card: territorio, n° operatori, **Riapri** → `/hub/mappa?vista=pianifica&pianoId=`, **Elimina** piano → `DELETE /api/mappa/piani?id=` con conferma).
- Sotto ogni piano, righe **operatore**: nome, **badge stato** (`statoBadge`), n° interventi, **Copia link / WhatsApp / Esporta Excel**, **Rimuovi** (`DELETE /api/mappa/piani/operatore?pianoId=&staffId=`, con conferma) → al successo ricarica.
- Riuso `statoBadge`/`whatsappHref` da `utils/rapportini/links`.
- Stato vuoto: "Nessun rapportino".

---

## 4. B — Aggiungi intervento manuale (editor)

### Pulsante + modale
Accanto a "+ Aggiungi attività da template" (in `MappaOperatoriClient.tsx`) → **"+ Aggiungi manuale"**. Apre `ManualTaskModal` con campi:
- **Indirizzo** (obbl.), **CAP**, **Comune** (obbl.), **ODSIN**, **PDR**, **Attività**, **Fascia oraria**, **Nominativo**.
- **Esecutore**: `<select>` degli operatori (`operatorOptions`), opzionale ("— nessuno / auto —").

### Comportamento al salvataggio (in `MappaOperatoriClient`)
1. Costruisce un `Task`: `{ id: 'manual-' + Date.now(), indirizzo, cap, citta, odsin, pdr, attivita, fascia_oraria, nominativo, odl: '', priorita: 0, _operatore: <nome operatore scelto> }`.
2. **Geocodifica** il singolo task (riuso `geocodeTask`).
3. Lo aggiunge a `excelTasks` (compare su mappa + entra in `allTasks`/distribuzione).
4. Se è stato scelto un esecutore: imposta `esecutorePins[task.id] = staffId` e **auto-seleziona** l'operatore (stessa logica base/indirizzo di `toggleOp`) se non già selezionato. (Match diretto per `staffId`, niente ricerca per nome.)
5. Se esiste già una distribuzione, ricalcola (`distributeToOps`). Chiude la modale.
- Validazione minima: Indirizzo + Comune valorizzati.

---

## 5. C — Card colorate nel rapportino digitale

### Logica pura — `utils/rapportini/voceColore.ts` (+ test)
`voceEsitoColore(risposte, campi)` → `'verde' | 'rossa' | 'neutro'`. Considera solo i campi "esito" (tipo `crocetta` e `select`; `testo`/`numero` ignorati):
- **negativo** se: una `crocetta` con chiave/etichetta che matcha `/assent/i` è spuntata (`=== true`), **oppure** una `select` con valore che matcha `/^(no|assente|negativ\w*|ko)$/i`.
- **positivo** se (e nessun negativo): una `crocetta` (non-assente) spuntata, **oppure** una `select` con valore non vuoto.
- Risultato: se c'è un negativo → `'rossa'`; altrimenti se c'è un positivo → `'verde'`; altrimenti `'neutro'`.
- Test: Standard (crocetta ASSENTE → rossa; ATT/CESS → verde), select Eseguito (NO → rossa, SI → verde), vuoto/solo-note → neutro.

### UI — `RapportinoForm.tsx` (VoceCard)
- In `VoceCard`, calcolare `const colore = voceEsitoColore(voce.risposte, campi);` (reattivo: la card si ricolora mentre l'operatore compila).
- Applicare alla `<section>` della card un bordo/sfondo:
  - `verde`: `border-[var(--success)] bg-[var(--success-soft)]`
  - `rossa`: `border-[var(--danger)] bg-[var(--danger-soft)]`
  - `neutro`: stile attuale (`border-[var(--brand-border)] bg-[var(--brand-surface)]`).
- Nessun'altra modifica al form (autosave/invio invariati).

---

## 6. Casi limite

| Caso | Comportamento |
|---|---|
| A — nessun rapportino | "Nessun rapportino". |
| A — elimina piano / rimuovi ultimo operatore | Il gruppo/piano sparisce al refresh. |
| B — indirizzo/comune mancanti | "Aggiungi" disabilitato/validazione. |
| B — esecutore non scelto | Task aggiunto senza pin (distribuzione automatica). |
| C — card con solo Note compilate | Neutra (le note non sono esito). |
| C — sia positivo che ASSENTE | Rossa (il negativo ha priorità). |

## 7. Testing (Vitest)

- `groupRapportiniByDay` (A) — puro, test raggruppamento/ordinamento.
- `voceEsitoColore` (C) — puro, test dei casi sopra.
- B è I/O/UI → `tsc` + verifica manuale.
- Verifica manuale: A (vista riepilogo, azioni), B (modale → task su mappa → distribuzione), C (compilo SI→verde, NO→rossa, vuoto→neutro).

## 8. File coinvolti

| Area | File | Azione |
|---|---|---|
| A — API | `app/api/mappa/rapportini/riepilogo/route.ts` | Create |
| A — util | `utils/rapportini/groupByDay.ts` (+test) | Create |
| A — UI | `components/modules/mappa/RiepilogoRapportini.tsx` | Create |
| A — vista/card | `app/hub/mappa/page.tsx` | Modify |
| B — modale | `components/modules/mappa/ManualTaskModal.tsx` | Create |
| B — editor | `components/modules/mappa/MappaOperatoriClient.tsx` | Modify (pulsante + handler) |
| C — util | `utils/rapportini/voceColore.ts` (+test) | Create |
| C — UI | `components/modules/rapportini/RapportinoForm.tsx` | Modify (colore card) |

## 9. Note

- **Nessuna SQL / migrazione.**
- Branch `feat/rapportini-riepilogo-manuale-colori` da `main`; un solo deploy finale.
- Coerenza tema Aurea (`--brand-*`, `--success`, `--danger`).
