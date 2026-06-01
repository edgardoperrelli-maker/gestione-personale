# Design — Link rapportini nell'editor mappa

- **Data:** 2026-06-01
- **Stato:** in attesa di revisione utente
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router) · React 19 · Supabase · TypeScript · Tailwind 4 · zod · Vitest
- **Collegato a:** [Blocco B — rapportini interattivi](2026-05-31-rapportini-interattivi-design.md)

---

## 1. Contesto e obiettivo

Il modulo "rapportini interattivi" è già completo e mergiato: generazione token, rotta
pubblica `/r/[token]`, autosave, invio, export. Oggi però i link si generano **solo** dal
**Registro pianificazioni** (`RegistroPianificazioni.tsx` → `RapportiniModal`).

L'obiettivo è portare la generazione **dentro l'editor mappa** (`MappaOperatoriClient.tsx`):
dopo aver **distribuito** gli interventi e premuto **"Salva distribuzione"**, accanto al nome
di ogni operatore deve comparire il **link al rapportino** (con Copia / WhatsApp / Esporta
Excel), senza dover passare dal Registro.

## 2. Scope

**In scope:**
- Salvataggio **in-place** del piano (update invece di delete+recreate) per non invalidare i token già emessi.
- Pulsante **"Genera rapportini"** nell'editor, visibile dopo il salvataggio del piano.
- Link + azioni (Copia, WhatsApp, Esporta Excel) e badge stato **accanto a ogni operatore** nella tabella di distribuzione.
- **Pulizia rapportini orfani** (operatore rimosso dal piano) in fase di generazione.

**Fuori scope:**
- Nuove tabelle o modifiche allo schema DB (si riusa tutto l'esistente).
- Modifiche alla rotta pubblica `/r/[token]`, all'autosave o all'export (invariati).
- Selettore template nell'editor (si usa il **template di default**; selettore eventuale è un'estensione futura).
- Modifiche al `RapportiniModal` del Registro (resta com'è, in parallelo).

## 3. Decisioni (confermate con l'utente)

| Tema | Scelta |
|---|---|
| Trigger | Pulsante **"Genera rapportini"** che appare dopo il Salva (no auto-generazione). |
| Stabilità link | **Salvataggio in-place**: il piano viene aggiornato mantenendo lo stesso `piano_id`. |
| Azioni per operatore | **Copia link + WhatsApp + Esporta Excel** (come nel modal esistente). |
| Rapportini orfani | **Pulizia in `genera`**: si eliminano i rapportini il cui `staff_id` non è più nel piano. |
| Template | **Default** (`rapportino_template.is_default`), preso automaticamente. |

## 4. Modello dati

**Nessuna modifica.** Si riusano `mappa_piani`, `mappa_piani_operatori`, `rapportini`,
`rapportino_voci`, `rapportino_template`. Punto chiave: `rapportini.piano_id` referenzia
`mappa_piani` (con `on delete cascade`); `rapportini.staff_id` è **testo** (nessuna FK verso
`mappa_piani_operatori`). Quindi:
- finché il **`piano_id` resta lo stesso**, i rapportini (e i token) sopravvivono;
- rigenerare le righe `mappa_piani_operatori` (delete+insert) **non** tocca i rapportini.

**Nessuna SQL da lanciare al PC** per questa feature.

## 5. Salvataggio in-place — `PUT /api/mappa/piani`

Oggi `POST /api/mappa/piani` **inserisce sempre** un nuovo piano; il client fa
**DELETE + POST** ad ogni salvataggio ([`MappaOperatoriClient.tsx:1486`](../../../components/modules/mappa/MappaOperatoriClient.tsx)),
ricreando il `piano_id` e — via cascade — distruggendo eventuali rapportini.

**Nuovo ramo update** (un `PUT` in `app/api/mappa/piani/route.ts`), body `{ id, data,
territorio, note, stato, operatori, regole, lucchetti }`:
1. Recupera l'utente autenticato (per `updated_by`), come nel POST.
2. `UPDATE mappa_piani SET data, territorio, note, stato, updated_by WHERE id` (404 se non esiste).
3. **Rigenera i figli** mantenendo `piano_id`:
   - `DELETE mappa_piani_operatori WHERE piano_id = id` poi `INSERT` delle nuove righe (stessa forma del POST).
   - `DELETE mappa_assegnazioni_manuali WHERE piano_id = id` poi `INSERT` (`buildRuleRows`).
   - `DELETE mappa_piani_lucchetti WHERE piano_id = id` poi `INSERT` (`buildLockRows`).
4. `UPSERT mappa_distribuzioni` (come nel POST, `onConflict: 'staff_id,data'`).
5. Risponde `{ ok: true, id }`.

Il POST resta invariato (usato per il **primo** salvataggio).

### Client — `saveDistribution`
- Rimuovere il blocco DELETE+recreate ([righe 1486-1491](../../../components/modules/mappa/MappaOperatoriClient.tsx)).
- Se `currentPianoId` esiste → **PUT** `{ id: currentPianoId, ... }` (il `piano_id` non cambia, l'URL resta `?pianoId=`).
- Se non esiste → **POST** come ora, poi `setCurrentPianoId(json.id)`.
- `setSavedDistribution(true)` in entrambi i casi.

## 6. Blocco "Rapportini" nell'editor

Nuovo blocco nel pannello distribuzione, **visibile solo quando `savedDistribution &&
currentPianoId`** (cioè il piano è salvato).

**Stato locale (nel componente o in un piccolo sotto-componente `RapportiniInline`):**
- `templates` / `defaultTemplateId` — da `GET /api/admin/rapportino-template` (si prende `is_default ?? primo`).
- `rapportiniStato: RapportinoStato[]` — da `GET /api/mappa/rapportini?pianoId=<currentPianoId>`.
- `generating`, `errore`, `copiedToken`.

**Caricamento:** quando `currentPianoId` cambia (incluso il caricamento di un piano esistente in
edit mode), fetch dello stato rapportini per mostrare i link già emessi.

**Pulsante "📋 Genera rapportini"** (e "Rigenera" se già presenti):
- `POST /api/mappa/rapportini/genera { pianoId: currentPianoId, templateId: defaultTemplateId }`;
- al successo, ri-fetch `GET /api/mappa/rapportini?pianoId=` per aggiornare i link/stati.

## 7. Link accanto a ogni operatore

Nella tabella operatori ([righe 2277-2306](../../../components/modules/mappa/MappaOperatoriClient.tsx)),
nella cella del nome, sotto a nome+indirizzo, quando esiste un rapportino per quell'operatore:
- **Match** operatore→rapportino tramite `distribution[idx]?.staffId` ↔ `rapportino.staff_id`
  (con fallback su `staff_name` se `distribution` non è disponibile in qualche percorso edit-mode — da confermare leggendo il caricamento del piano salvato).
- Mostra: **badge stato** (In corso / Inviato / Scaduto, con `statoCalcolato`), **Copia link**,
  **WhatsApp** (`https://wa.me/?text=` + testo + `url`), **Esporta Excel**
  (`/api/mappa/rapportini/export?rapportinoId=<id>`).
- Riuso 1:1 della logica del modal: `handleCopy`, `whatsappHref`, `statoBadge`
  ([`RegistroPianificazioni.tsx:413-426`](../../../components/modules/mappa/RegistroPianificazioni.tsx)) — valutare l'estrazione in un piccolo modulo condiviso per non duplicare.

## 8. Pulizia rapportini orfani (in `genera`)

In `app/api/mappa/rapportini/genera/route.ts`, dopo aver caricato gli operatori del piano:
- `currentStaffIds = ops.map(o => o.staff_id)`;
- prima/dopo il ciclo di upsert, `DELETE FROM rapportini WHERE piano_id = pianoId AND staff_id NOT IN (currentStaffIds)` (con guardia sul caso lista vuota). La cascade elimina anche le relative voci.

## 9. Casi limite

| Caso | Comportamento |
|---|---|
| Ri-salvataggio dopo invio link | Token preservati (in-place). Le risposte già compilate restano (merge per `task_id` in `genera`). |
| Operatore rimosso e ri-salvato | Il suo rapportino viene eliminato alla prossima generazione (pulizia orfani). |
| Genera senza template attivi | Errore gentile "Nessun modello attivo — crea un template in Impostazioni". |
| Piano non ancora salvato | Il blocco rapportini non compare (serve `currentPianoId`). |
| Link assoluto per WhatsApp | Dipende da `NEXT_PUBLIC_SITE_URL` (presente in `.env.local`; **confermare anche nelle env di Vercel** in produzione, altrimenti l'URL è relativo). |
| Distribuzione cambiata dopo il salvataggio | `savedDistribution` torna `false` (effetto su `distribution`), il blocco si nasconde finché non si ri-salva. |

## 10. Testing (Vitest)

La logica nuova è prevalentemente I/O (API + UI), poco unit-testabile. Parti pure da estrarre + testare:
- `orphanStaffIds(currentStaffIds, existingStaffIds)` → elenco `staff_id` da eliminare. Test: rimossi/aggiunti/uguali, lista vuota.
- (Eventuale) `rapportinoForStaff(staffId, rapportini)` se il matching diventa un helper.

**Verifica manuale** (runtime con app + Supabase): distribuisci → Salva → "Genera rapportini" →
Copia/WhatsApp compaiono accanto agli operatori → apri `/r/<token>`, compila una voce →
torna nell'editor, **modifica e ri-salva** → il link è **ancora valido** e la risposta è
conservata → "Rigenera" riflette eventuali nuovi interventi → rimuovi un operatore, ri-salva e
rigenera → il suo link sparisce.

## 11. File coinvolti

| Area | File | Azione |
|---|---|---|
| API piani (update in-place) | `app/api/mappa/piani/route.ts` | Modify (aggiungi `PUT`) |
| Save client | `components/modules/mappa/MappaOperatoriClient.tsx` (`saveDistribution`) | Modify (PUT se `currentPianoId`) |
| Blocco rapportini + link per operatore | `components/modules/mappa/MappaOperatoriClient.tsx` | Modify (UI + stato + fetch) |
| Pulizia orfani | `app/api/mappa/rapportini/genera/route.ts` | Modify |
| Logica pura (orfani) | `utils/rapportini/orphans.ts` (+ test) | Create |
| (Opz.) helper condivisi UI | `utils/rapportini/links.ts` o simile (`whatsappHref`, `statoBadge`) | Create/refactor |

## 12. Note

- Nessuna migrazione SQL per questa feature.
- Il `RapportiniModal` del Registro resta disponibile in parallelo (stesso backend).
- Coerenza stile: tema Aurea (variabili `--brand-*`), come il resto dell'editor mappa.
