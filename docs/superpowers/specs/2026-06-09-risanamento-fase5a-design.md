# Risanamento colonne — Fase 5a: Chiusura (validazione + conteggio + archivio)

**Data:** 2026-06-09
**Stato:** Design approvato
**Progetto:** Flusso "Risanamento colonne" (multi-fase). Questo documento copre **solo la Fase 5a** (chiusura). Il PDF è la Fase 5b.

---

## Contesto

Dopo la 4a/4b l'operatore compila i civici con righe-misuratore (foto prima/dopo) + fasi/accessorie. La 5a aggiunge la
**chiusura** del rapportino risanamento: validazione foto obbligatorie, conferma del numero di punti gas, invio e
**archiviazione** dei misuratori lavorati. Riusa il più possibile la chiusura standard (`POST /api/r/[token]/invia`).

---

## Sezione 1 — Helper validazione (puro, testabile)

`utils/rapportini/righeIncomplete.ts`:
- `righeIncomplete(voci, righe, campiSnapshot)`: restituisce gli elementi incompleti rispetto ai **campi foto
  obbligatori** (`tipo='foto'`, `obbligatoria===true`), per scope:
  - per ogni `riga` (misuratore): mancano i campi `scope='misuratore'` obbligatori non presenti in `riga.risposte`.
  - per ogni `voce` (civico) che ha almeno una riga: mancano i campi `scope='fase'` obbligatori non presenti in
    `voce.risposte`.
  - le accessorie (`scope='accessoria'`) non sono mai obbligatorie → ignorate.
- Ritorna `{ ok: boolean, dettagli: Array<{ tipo: 'riga'|'civico', civico: string, matricola?: string, campiMancanti: string[] }> }`.
- Usa `campiPerScope` (Fase 4a). Una foto è "presente" se `risposte[chiave]` è una stringa non vuota.

## Sezione 2 — Conteggio punti gas

1 riga-misuratore = 1 punto gas. Il totale è `righe.length` (su tutti i civici del rapportino). Mostrato in una
**modale di conferma** prima dell'invio: "Rilevati N punti gas (N misuratori in M civici). Confermi l'invio?" →
*Conferma* prosegue, *Annulla* chiude la modale. Nessun campo da dichiarare a mano (l'app conta).

## Sezione 3 — Estensione `POST /api/r/[token]/invia` (server)

Quando `rapportino.tipo === 'risanamento'`:
- **Gate validazione**: ricarica voci + righe, esegue la logica di `righeIncomplete`; se non `ok` → `409
  { error: 'foto_mancanti', dettagli }` (l'operatore non può chiudere).
- **Invio**: `stato='inviato'`, `submitted_at=now()` (come standard). Il ciclo esistente sugli interventi resta: le
  voci-civico non hanno `intervento_id` → vengono saltate naturalmente; nessuna regressione sul flusso standard.
- **Archivio** (best-effort, dopo l'invio): per ogni `riga` con `ref_id` non null, legge il record
  `risanamento_misuratori_ref` corrispondente e: (a) lo inserisce in `risanamento_misuratori_archivio`
  (`matricola, pdr, nominativo, indirizzo, civico, comune, cap, import_id, ref_id_originale=ref.id, rapportino_id`),
  (b) lo elimina da `risanamento_misuratori_ref`. Batch unico per rapportino. Le righe `manuale`/`fuori_elenco`
  (senza `ref_id`) non toccano l'estrazione. Idempotenza: se il ref è già stato rimosso (re-invio), lo step salta.

Per `tipo='standard'` il comportamento resta identico a oggi.

## Sezione 4 — UI invio in `RisanamentoView`

Oggi la vista risanamento non ha il footer di invio (presente solo in `RapportinoLista`). Aggiungo:
- Un **footer** con il bottone "Invia rapportino" (stile come `RapportinoLista`), visibile se `!readOnly`.
- Flusso al click:
  1. calcola le righe incomplete (stessa logica dell'helper, lato client) → se ce ne sono, mostra un pannello
     "Mancano foto" con civico/matricola e **non** procede;
  2. altrimenti apre la **modale punti gas** (conteggio);
  3. su conferma → `POST /api/r/${token}/invia` → se `409 foto_mancanti` mostra i dettagli; se ok → stato inviato
     (sola lettura, messaggio di conferma).

## Data flow

```
[Invia] → righeIncomplete(client) → se incomplete: pannello "mancano foto" (stop)
                                  → else: modale "N punti gas" → conferma
        → POST /invia → server: righeIncomplete(gate 409) → stato=inviato → archivio (ref→archivio + delete ref)
        → UI: sola lettura
```

## Error handling

- Foto obbligatorie mancanti → blocco client + gate server 409 `foto_mancanti` con `dettagli`.
- Archivio best-effort: un errore nell'archiviazione non annulla l'invio già avvenuto (lo stato resta 'inviato'); l'admin può ripulire l'estrazione a mano dal modulo Estrazione misuratori. Logga l'errore.
- Re-invio (rapportino riaperto): l'archivio salta i ref già rimossi (idempotente).

## Testing

- Unit: `righeIncomplete` (riga senza foto obbligatoria, riga completa, civico con fase obbligatoria mancante, accessorie ignorate, rapportino senza righe).
- Unit: conteggio punti gas (= numero righe).
- Server/UI: `tsc`/`eslint`/`build`; il flusso completo (invio + archivio) si verifica sul DB reale dopo le migration.

## Fuori scope (Fase 5b)

- Generazione PDF con foto embeddate (sotto-fase 5b).
- Nessuna modifica al flusso standard di chiusura.
