# Feedback note obbligatorie con esito negativo (operatore) — design

**Data:** 2026-06-11
**Stato:** Design approvato (brainstorming) — in attesa di review spec prima del piano

## Problema

La validazione **esiste già**: una voce con esito **negativo** ma **senza nota** resta "da fare"
(`voceEsitoColore` → `neutro`) e blocca l'invio. Ma manca **ogni feedback** all'operatore:
- non sa perché la voce resta incompleta dopo aver messo l'esito negativo;
- quando il rapportino è incompleto il pulsante **"Invia rapportino"** è solo **disabilitato e muto**
  ([`RapportinoLista.tsx`](../../../components/modules/rapportini/RapportinoLista.tsx)) — nessun "cosa manca".

Servono **3 feedback** (nessuna nuova validazione, nessuna SQL).

## Decisioni (brainstorming)

| Tema | Decisione |
|------|-----------|
| Avviso immediato (esito negativo) | Riquadro inline **"⚠️ Esito negativo: la nota è obbligatoria"** nel dettaglio voce + campo nota **evidenziato** (bordo rosso) finché vuoto. Reattivo. **No popup.** |
| "Cosa manca" sull'invio | **Lista cliccabile sempre visibile** sopra il pulsante Invia (disabilitato): ogni voce incompleta col motivo, cliccabile per saltarci. |
| Quando la nota è obbligatoria | **Invariato** (solo con esito negativo). |
| SQL | **Nessuna.** |

## Architettura

Riusa l'unica fonte di verità `voceColore` (rapportino digitale operatore). Niente nuova validazione.

1. **Core puro.**
   - Estrai da `voceColore.ts` un helper `esitoNegativoPresente(risposte, campi): boolean` (la rilevazione
     "negativo" già dentro `voceEsitoColore`: crocetta `nomeNegativo` spuntata, oppure select
     `NEG_SELECT`/`nomeNegativo` valorizzata). Riusalo dentro `voceEsitoColore` → **DRY, comportamento invariato**.
   - Nuovo `motivoVoceIncompleta(risposte, campi): 'senza_esito' | 'nota_mancante' | null`:
     - `null` se `voceEsitoColore !== 'neutro'` (voce completa: verde o rossa);
     - se `neutro`: `esitoNegativoPresente` true → `'nota_mancante'`, altrimenti `'senza_esito'`.
2. **Avviso immediato (`VoceCard`).** Se `motivoVoceIncompleta === 'nota_mancante'` → banner + il campo nota
   (testo, `/^note/i`) evidenziato. È reattivo perché `VoceCard` ri-renderizza a ogni `onChange`.
3. **Lista "cosa manca".** `RapportinoForm` calcola `mancanti: { index, titolo, motivo }[]` (escludendo le
   annullate) e la passa a `RapportinoLista`, che la mostra **sopra** il pulsante Invia (disabilitato) —
   righe **cliccabili** → `onApri(index)`.

## Dettaglio per area

### Core (`utils/rapportini`)
- `voceColore.ts`: estrai `export function esitoNegativoPresente(risposte, campi): boolean`; `voceEsitoColore`
  lo riusa. **Comportamento di `voceEsitoColore` INVARIATO** (i test esistenti restano verdi).
- nuovo `utils/rapportini/voceMancante.ts`: `motivoVoceIncompleta(...)` + tipo `MotivoIncompleto`. (+ test)

### Avviso immediato (`VoceCard`)
- `VoceCard.tsx`: calcola `notaMancante = motivoVoceIncompleta(voce.risposte, campi) === 'nota_mancante'`; se
  true rende un banner (token `--danger`/`--warning`) e passa `evidenziaNota` a `VoceCampi`.
- `CampoInput.tsx`: nuova prop opzionale `evidenzia?: boolean`; quando true il `textarea` (campo testo) ha
  bordo rosso. `VoceCampi` la passa **solo** al campo nota (`/^note/i`) quando `notaMancante`.

### Lista "cosa manca" (`RapportinoLista`)
- `RapportinoForm.tsx`: costruisce `mancanti` (voci non annullate con `motivoVoceIncompleta != null`) e lo
  passa a `RapportinoLista`.
- `RapportinoLista.tsx`: nuova prop `mancanti: { index, titolo, motivo }[]`; sopra il pulsante Invia, se
  `mancanti.length > 0`, rende un riquadro con le righe cliccabili (`onApri(index)`), motivo tradotto
  ("senza esito" / "nota obbligatoria mancante"). Il pulsante Invia resta disabilitato (logica `inviabile`
  invariata).

## Edge case

- **Voce annullata** → esclusa da `mancanti` (già esclusa da `daFare`).
- **Template senza campo nota** → `noteCompilate` ritorna true → esito negativo = rossa (completa), nessun
  `'nota_mancante'`. Coerente.
- **Esito positivo** → nota facoltativa, nessun avviso.
- **Più campi nota** → tutti obbligatori (`noteCompilate.every`); l'evidenza copre i campi nota.
- **readOnly / inviato** → nessun avviso/lista (non modificabile).

## File coinvolti

| File | Modifica |
|------|----------|
| `utils/rapportini/voceColore.ts` | estrai `esitoNegativoPresente` (riuso interno, comportamento invariato) |
| `utils/rapportini/voceMancante.ts` | nuovo: `motivoVoceIncompleta` (+ test) |
| `components/modules/rapportini/CampoInput.tsx` | prop `evidenzia` (bordo rosso textarea) |
| `components/modules/rapportini/VoceCard.tsx` | banner nota obbligatoria + evidenzia nota |
| `components/modules/rapportini/RapportinoForm.tsx` | calcola lista `mancanti` |
| `components/modules/rapportini/RapportinoLista.tsx` | render lista cliccabile sopra invio |

## Da verificare in fase di piano (non cambia il design)

- Punto esatto in `voceColore` dove estrarre `esitoNegativoPresente` senza alterare `voceEsitoColore`
  (test di regressione).
- Come `VoceCampi`/`CampoInput` identificano il campo nota (riusa `NOTE_FIELD` `/^note/i`: esportarlo da
  `voceColore` o replicarlo in un punto condiviso).
- Punto di render in `VoceCard` (banner) e in `RapportinoLista` (lista sopra l'invio).
- **Sovrapposizione** col branch concorrente `feat/correzione-esiti-rapportino` sugli stessi file
  (voceColore/VoceCard/RapportinoLista) → gestire con rebase al merge.

## Strategia di test (TDD)

- **Pura `voceColore`**: `esitoNegativoPresente` true su crocetta negativa / select NEG, false altrimenti;
  e `voceEsitoColore` **invariato** (i test esistenti restano verdi).
- **Pura `voceMancante`**: `motivoVoceIncompleta` → `'nota_mancante'` (negativo + nota vuota),
  `'senza_esito'` (niente esito), `null` (verde/rossa, oppure negativo + nota piena).
- **UI manuale**: banner reattivo, evidenza nota, lista cliccabile, pulsante resta disabilitato.

## Fuori scope

- Cambiare *quando* la nota è obbligatoria (resta "solo con esito negativo").
- Lato ufficio/admin.
- Foto obbligatorie (già gestite a parte).
- Avviso a popup (escluso in Q1).
