# Design — Gestione pianificazioni & rapportini (template, eliminazione, info complete)

- **Data:** 2026-06-01
- **Stato:** in attesa di revisione utente
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router) · React 19 · Supabase · TypeScript · Tailwind 4 · zod · Vitest
- **Collegato a:** [Link rapportini nell'editor mappa](2026-06-01-link-rapportini-editor-mappa-design.md) · [Auto-assegnazione Esecutore](2026-06-01-esecutore-autoassegnazione-mappa-design.md)

---

## 1. Contesto e obiettivo

Quattro migliorie al ciclo di vita di pianificazioni e rapportini, emerse usando la feature in produzione:

- **A.** Nell'editor mappa "Genera rapportini" usa il template di default senza farlo scegliere → serve un **selettore template** lì.
- **B.** Dal Registro si può eliminare solo l'**intero** piano → serve poter rimuovere **singoli operatori** (con invalidazione del loro link).
- **C.** Il rapportino digitale (`/r/[token]`) mostra solo 7 campi → deve mostrare **tutte** le info dell'intervento, come nel report Excel.
- **D.** I template predefiniti sono già modificabili, ma il **default non è eliminabile** → renderli **gestibili in tutto** (eliminazione inclusa), con la sola protezione di non restare a zero template.

## 2. Scope

**In scope:** A, B, C, D come sopra; conferma che l'aggiornamento interventi del rapportino (riapri → aggiungi → salva → rigenera) già funziona, con un piccolo hint.

**Fuori scope:** nuove tabelle/SQL; riassegnazione automatica degli interventi di un operatore rimosso (vengono rimossi); auto-promozione di un nuovo default quando si elimina quello esistente (il picker usa `is_default ?? primo`).

## 3. Decisioni (confermate)

| Tema | Scelta |
|---|---|
| A — selettore template | `<select>` **inline** nell'editor, accanto a Genera/Rigenera, pre-selezionato sul default. |
| B — interventi di un operatore rimosso | **Rimossi** dal piano (no riassegnazione); link invalidato. |
| B — ultimo operatore | Se rimosso l'ultimo operatore → **elimina il piano**. |
| C — campi mostrati | Tutti gli 11 campi snapshot non vuoti. |
| D — predefiniti | **Eliminazione sbloccata**; protezione: non eliminabile l'**ultimo** template rimasto. |
| 2b | Già funzionante; solo un hint. |

## 4. A — Selettore template nell'editor

`components/modules/mappa/MappaOperatoriClient.tsx`:
- Oggi un `useEffect` carica i template e salva solo `rapTemplateId` (default). Aggiungere uno stato `rapTemplates: { id: string; nome: string; is_default?: boolean }[]` popolato con l'intera lista.
- Accanto al pulsante "Genera/Rigenera rapportini" (visibile quando `savedDistribution && currentPianoId`), un `<select>` compatto legato a `rapTemplateId` con opzioni dai `rapTemplates` (mostra "(default)" sul default). Se la lista è vuota → opzione "Nessun modello" e Genera disabilitato (già gestito da `!rapTemplateId`).
- `generaRapportini` invariato (usa `rapTemplateId`).

## 5. B — Eliminazione per singolo operatore

### Nuova rotta `DELETE /api/mappa/piani/operatore`
`app/api/mappa/piani/operatore/route.ts`, `runtime = 'nodejs'`, service role. Query `?pianoId=&staffId=` (o body):
1. Elimina i rapportini di `(piano_id = pianoId, staff_id = staffId)` → cascade su `rapportino_voci` → **token/link non più validi**.
2. Elimina la riga `mappa_piani_operatori` per `(piano_id, staff_id)` (operatore + interventi nel JSONB `tasks`).
3. Azzera il contatore: `mappa_distribuzioni` `task_count = 0` per `(staff_id, data del piano)` (come fa la DELETE del piano).
4. Conta gli operatori rimasti: se **0**, elimina anche il piano (`mappa_piani` → cascade su rapportini residui).
5. Risponde `{ ok: true, pianoDeleted: boolean }`.

### UI nel modal "Rapportini" (`RegistroPianificazioni.tsx`)
- Ogni riga operatore (già con stato + Copia/WhatsApp/Excel) prende un pulsante **"Rimuovi"** con conferma inline (stile "Elimina?/Sì/No" come nella tabella piani).
- Al successo: la `RapportiniModal` riceve dal padre una callback **`onChanged()`** (oltre a `onRefreshAlerts`). Dopo ogni rimozione il modal chiama `caricaStato()` (aggiorna l'elenco operatori nel modal) **e** `onChanged()`, che nel padre (`RegistroPianificazioni`) **ri-fetcha i piani** (così il conteggio "Operatori" in tabella è aggiornato) e gli alert. Se la risposta ha `pianoDeleted: true` → il modal chiama anche `onClose()` (il suo piano non esiste più).
- L'**eliminazione intera** resta il pulsante "Elimina" della tabella (invariato, cascade già invalida i link).

## 6. C — Rapportino digitale con tutte le info

- `app/r/[token]/page.tsx`: la query `rapportino_voci` aggiunge i campi mancanti già presenti in tabella: **`matricola, odsin, recapito, accessibilita`** (oltre a `nominativo, pdr, via, comune, cap, attivita, fascia_oraria`). Mappa i nuovi campi nel tipo `Voce`.
- `components/modules/rapportini/RapportinoForm.tsx`:
  - Estendere il tipo `Voce` con `matricola?, odsin?, recapito?, accessibilita?`.
  - In `VoceCard`, l'array `anagrafica` elenca tutti gli 11 campi con etichette IT: Nominativo, Matricola, PDR, ODSIN, Via, Comune, CAP, Recapito, Attività, Accessibilità, Fascia oraria — filtrati sui non vuoti (comportamento attuale, solo più campi).

## 7. D — Template predefiniti gestibili in tutto

- `app/api/admin/rapportino-template/route.ts` → `DELETE`: **rimuovere** il guard `if (tpl?.is_default) → 409`. **Aggiungere** un guard sull'ultimo: contare i template totali; se `count <= 1` → `409 "Non puoi eliminare l'ultimo template"`. (L'editing via `PATCH` è già libero per tutti, default incluso.)
- `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx`: mostrare il pulsante "Elimina template" **per tutti** i template selezionati (rimuovere la condizione `!selectedTpl.is_default`). `handleDelete`: togliere il blocco client `if (tpl?.is_default) …`; mantenere il `confirm()`; mostrare l'errore se l'API risponde 409 (ultimo template). Dopo eliminazione, ricarica lista e resetta la selezione (già fatto).

## 8. 2b — Aggiornamento interventi (conferma)

Già funzionante: Riapri (Registro) → editor con `pianoId` → aggiungi/modifica interventi → **Salva** (PUT in-place, mantiene `piano_id`) → **Rigenera rapportini** (merge per `task_id`: conserva risposte, aggiunge nuove voci, rimuove assenti) → l'operatore vede i nuovi interventi **sullo stesso link**. Tocco minore (opzionale): nell'editor, quando `distribution` cambia dopo che esistono rapportini (`rapStato.length>0`), mostrare un hint "Modifiche non ancora nei rapportini — premi *Rigenera*".

## 9. Casi limite

| Caso | Comportamento |
|---|---|
| Rimozione ultimo operatore da un piano | Elimina il piano; il modal si chiude e la lista si aggiorna. |
| Operatore con rapportino già "inviato" | Rimosso comunque; il link smette di funzionare. |
| Eliminare l'unico template | Bloccato (409); messaggio in UI. |
| Eliminare il template di default (con altri presenti) | Consentito; il picker userà `is_default ?? primo` (resta funzionante anche senza default). |
| Voce con campi vuoti nel rapportino digitale | I campi vuoti non vengono mostrati (filtro non-vuoti). |
| Template selezionato nell'editor poi disattivato altrove | Alla generazione l'API valida il `templateId`; in caso d'errore mostra il messaggio. |

## 10. Testing (Vitest)

La maggior parte è I/O/UI → `npx tsc --noEmit` + verifica manuale. Logica pura isolabile:
- (Opz.) `canDeleteTemplate(totalCount)` → boolean, test banale; oppure il guard resta inline nella route (nessun test puro).
- Verifica manuale: (A) genera scegliendo un template non-default; (B) rimuovi un operatore → il suo link va in "non trovato", gli altri restano; rimuovi l'ultimo → piano sparito; (C) apri `/r/<token>` → vedi tutti i campi; (D) elimina un template non-default, prova a eliminare l'unico rimasto → bloccato, modifica lo "Standard" → salva.

## 11. File coinvolti

| Area | File | Azione |
|---|---|---|
| A | `components/modules/mappa/MappaOperatoriClient.tsx` | Modify (lista template + select) |
| B | `app/api/mappa/piani/operatore/route.ts` | Create (DELETE per-operatore) |
| B | `components/modules/mappa/RegistroPianificazioni.tsx` | Modify ("Rimuovi" per operatore + refresh lista) |
| C | `app/r/[token]/page.tsx` | Modify (query + mapping Voce) |
| C | `components/modules/rapportini/RapportinoForm.tsx` | Modify (tipo Voce + anagrafica) |
| D | `app/api/admin/rapportino-template/route.ts` | Modify (DELETE: guard "ultimo" invece di is_default) |
| D | `app/impostazioni/template-rapportini/TemplateRapportiniClient.tsx` | Modify (pulsante Elimina per tutti) |

## 12. Note

- **Nessuna SQL / migrazione.**
- Tutto sul branch `feat/gestione-pianificazioni-rapportini` che parte dal lavoro Esecutore → un unico deploy finale con: link rapportini editor (già in prod) + Esecutore + queste novità.
- Coerenza tema Aurea (`--brand-*`).
