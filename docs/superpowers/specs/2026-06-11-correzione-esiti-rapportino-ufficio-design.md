# Correzione esiti rapportino lato ufficio — design

**Data:** 2026-06-11
**Stato:** Design approvato (brainstorming) — in attesa di review spec prima del piano

## Problema

Gli operatori a volte **esitano una riga in modo sbagliato** (es. spuntano "Assente" invece di
"Eseguito", o lasciano una tendina sul valore errato). Oggi non esiste un punto lato ufficio per
**correggere direttamente** l'esito di una riga: l'unica via è "Riapri rapportino"
([app/api/admin/rapportini/riapri/route.ts](../../../app/api/admin/rapportini/riapri/route.ts)),
che rimette il rapportino `in_corso` e **richiede che l'operatore ricompili** — lento e dipendente
da lui.

Serve rendere **editabili le celle dei campi esito** nel dettaglio rapportino lato ufficio
([app/hub/rapportini/contenuto/[id]/page.tsx](../../../app/hub/rapportini/contenuto/[id]/page.tsx)),
con salvataggio che **ripropaga** la correzione agli `interventi`. In più, la tabella attuale ha
**scroll orizzontale** (troppe colonne `whitespace-nowrap`) che la rende poco leggibile: va resa
**tutta visibile in larghezza**.

## Dove vive l'esito (contesto)

- **Fonte di verità**: `rapportino_voci.risposte` (JSONB) — le risposte compilate dall'operatore.
- **Esito calcolato**: `utils/rapportini/voceColore.ts` (`voceEsitoColore`) traduce risposte +
  `campi_snapshot` in `verde` (Fatto) / `rossa` (Non fatto) / `neutro` (Da fare).
- **Propagazione**: `lib/interventi/esitoDaVoce.ts` (`patchInterventoLiveDaVoce`) scrive su
  `interventi.esito` (`eseguito_positivo` | `null`), `interventi.esito_motivo`, `interventi.stato`.

Correggere un esito = modificare `rapportino_voci.risposte` **e** ripropagare su `interventi`.

## Decisioni (brainstorming)

| Tema | Decisione |
|------|-----------|
| Celle editabili | **Solo i campi esito** (template: `crocetta`, `select`, `testo`, `numero`). Campi `foto` esclusi. Anagrafica **sola lettura**. |
| Layout | **Anagrafica compattata in 1 colonna** identificativa; la tabella resta (vista a confronto righe), niente `whitespace-nowrap`/`overflow-x-auto` → sta in larghezza. |
| Colonne campi mostrate | In modifica si mostrano **tutte** le colonne campi del template (non solo quelle compilate), così si possono correggere anche righe lasciate vuote. |
| Salvataggio | Pulsante **"Salva modifiche"** esplicito, attivo solo con modifiche pendenti; salvataggio **in blocco** di tutte le righe toccate. |
| Ripropagazione | Automatica al salvataggio, riuso `patchInterventoLiveDaVoce` (stessa logica della route operatore). |
| Stato rapportino | Funziona **anche su `inviato`** (a differenza della route operatore che blocca con 409). Non cambia lo `stato` del rapportino. |
| Anti-perdita-foto | Merge `{ ...risposte_esistenti, ...campi_modificati }`; **non** si sovrascrive il JSON intero. |
| SQL | **Nessuna** (solo colonne esistenti). |

## Architettura e flusso

La pagina dettaglio resta **Server Component** (auth admin + fetch dati) e delega la tabella a un
nuovo **Client Component** `RapportinoEditor`.

```
contenuto/[id]/page.tsx (server: auth + fetch rap + voci + campi_snapshot/info_snapshot)
   └─→ <RapportinoEditor rapportinoId voci campi info /> (client)
          ├─ render tabella editabile (stato locale risposte per voce)
          ├─ badge Esito live (voceEsitoColore) per riga
          └─ "Salva modifiche" → POST /api/admin/rapportini/voce
                                    ├─ requireAdmin
                                    ├─ per voce: merge risposte + update rapportino_voci
                                    └─ patchInterventoLiveDaVoce → update interventi
```

### Tabella (client) — `RapportinoEditor`

Colonne, da sinistra:
1. **`#`** — numero riga.
2. **`Esito`** (sola lettura) — badge 🟢 Fatto / 🔴 Non fatto / ⚪ Da fare calcolato **live** con
   `voceEsitoColore(risposteLocali, campi)`; si aggiorna mentre si modifica.
3. **`Intervento`** (1 colonna compatta, sola lettura) — nominativo in grassetto + ODL/indirizzo su
   righe sotto (`valoreInfo`), testo a capo. Sostituisce le ~11 colonne anagrafiche.
4. **Colonne campi esito** (editabili), una per campo del template (esclusi `foto`):
   - `crocetta` → checkbox
   - `select` → `<select>` con `campo.opzioni`
   - `testo` → input testo compatto
   - `numero` → input numerico

Stile: niente `whitespace-nowrap`, niente wrapper `overflow-x-auto`; `width:100%`, testo a capo →
nessuno scroll orizzontale.

Stato locale: copia delle `risposte` per ogni voce; un set di `voceId` "dirty". Editing di una cella
aggiorna `risposte[chiave]` della voce e marca la voce dirty.

Barra inferiore: **"Salva modifiche"** (disabilitato se nessuna voce dirty) + "N righe modificate" +
stato (`idle` / `salvataggio…` / `✓ salvato` / `errore`). Dopo il salvataggio ok, le voci tornano
"pulite" e i badge Esito riflettono lo stato persistito.

### API — `POST /api/admin/rapportini/voce`

Nuovo file `app/api/admin/rapportini/voce/route.ts`, modellato su
[riapri/route.ts](../../../app/api/admin/rapportini/riapri/route.ts).

- **Auth**: `requireAdmin()` (stesso helper/pattern: `createRouteHandlerClient` + `resolveUserRole`).
- **Body (zod)**: `{ rapportinoId: uuid, voci: [{ voceId: uuid, risposte: Record<string,unknown> }] }`.
- **Carico rapportino** (`supabaseAdmin`): `id, campi_snapshot`. **Nessun** check `tokenStatus` (scopo
  della route: correggere anche `inviato`).
- **Per ogni voce** (appartenente al `rapportinoId`):
  1. Carico la voce esistente: `id, intervento_id, risposte`.
  2. **Merge**: `nuoveRisposte = { ...risposteEsistenti, ...risposteRicevute }` (preserva chiavi non
     in tabella, incluse foto).
  3. `update rapportino_voci set risposte = nuoveRisposte, updated_at = now() where id = voceId and
     rapportino_id = rapportinoId`.
  4. **Ripropagazione** (best-effort, non fa fallire il salvataggio) se `intervento_id`: calcolo
     `patch = patchInterventoLiveDaVoce(nuoveRisposte, campi_snapshot)` e applico **le stesse guardie**
     della route operatore:
     - `azione === 'completa'` → `update interventi set stato='completato', esito, esito_motivo,
       chiuso_at=now() where id=intervento_id and stato != 'annullato'`;
     - altrimenti → `update interventi set stato='assegnato', esito=null, esito_motivo=null,
       chiuso_at=null where id=intervento_id and stato='completato'`.
- **Risposta**: `{ ok: true, aggiornate: N }`. Errori per-voce loggati; risposta riassume gli esiti.

## Dettaglio per area

### Server page
- `app/hub/rapportini/contenuto/[id]/page.tsx`: invariata la parte auth/fetch; sostituisce la
  `<table>` statica con `<RapportinoEditor>` passando `rapportinoId`, `voci` (con `id`, anagrafica,
  `risposte`), `campi` (tutti i `campi_snapshot` non-`foto`, ordinati), `info` (per la colonna
  Intervento compatta). La colonna campi **non** passa più da `colonneVisibili` (mostra tutti i campi);
  l'anagrafica resta compatta.

### Client component (nuovo)
- `components/modules/rapportini/RapportinoEditor.tsx`: tabella editabile, stato locale, badge Esito
  live, barra Salva. Riusa `voceEsitoColore` per il badge e `valoreInfo` per la colonna Intervento.
  Editor di cella compatti inline (no riuso di `CampoInput`, troppo grande per le celle).

### API (nuovo)
- `app/api/admin/rapportini/voce/route.ts`: come sopra. Riusa `supabaseAdmin`,
  `patchInterventoLiveDaVoce`, `resolveUserRole`.

## Edge case

- **Rapportino `inviato`** → editabile comunque (scopo della feature); lo `stato` del rapportino non
  cambia.
- **Voce senza `intervento_id`** → si salvano solo le `risposte` (nessuna propagazione). Non si tenta
  l'auto-aggancio della route operatore (fuori scope qui).
- **Correzione che riporta a neutro/rosso** una riga prima verde → revert dell'intervento a
  `assegnato` **solo** se era `completato` (guardia `.eq('stato','completato')`), per non declassare
  stati gestiti altrove.
- **Campi foto** → non in tabella; le loro chiavi in `risposte` sono **preservate** dal merge.
- **Nessuna modifica** → "Salva" disabilitato.
- **Errore di propagazione su una voce** → non blocca il salvataggio delle `risposte` (best-effort,
  loggato), coerente con la route operatore; l'esito è comunque riapplicabile.

## File coinvolti

| File | Modifica |
|------|----------|
| `app/hub/rapportini/contenuto/[id]/page.tsx` | tabella statica → `<RapportinoEditor>`; passa tutti i campi non-foto |
| `components/modules/rapportini/RapportinoEditor.tsx` | **nuovo** — tabella editabile + badge Esito + Salva |
| `app/api/admin/rapportini/voce/route.ts` | **nuovo** — salvataggio in blocco + ripropagazione esiti |

## Strategia di test (TDD)

- **Pura — merge risposte**: `{ ...esistenti, ...modificati }` preserva chiavi non toccate (incluse
  chiavi foto); le chiavi modificate vincono. (Nuovo piccolo helper testabile o test sul comportamento
  della route.)
- **Riuso esistente**: `patchInterventoLiveDaVoce`/`voceEsitoColore` già coperti
  ([esitoDaVoce.test.ts](../../../lib/interventi/esitoDaVoce.test.ts),
  [voceColore.test.ts](../../../utils/rapportini/voceColore.test.ts)); estendo solo se serve un caso
  di transizione verde→neutro su correzione admin non già coperto.
- **Verifica manuale (deploy)**: rapportino `inviato` con esito sbagliato → correggo la cella → badge
  Esito cambia → Salva → l'intervento riflette il nuovo esito in Live/Riepilogo.

## Da verificare in fase di piano (non cambia il design)

- Helper `requireAdmin` duplicato in `riapri/route.ts`: valutare se estrarlo in `lib/` o replicarlo
  (replica accettabile, coerente col codice attuale).
- Tipo esatto delle props di `RapportinoEditor` per allinearsi a `VoceInfo`/`TemplateCampo` senza
  rompere `valoreInfo`/`voceEsitoColore`.
- Stile celle/input compatti coerente coi token `--brand-*` esistenti.

## Fuori scope

- Editing dell'**anagrafica** della voce (solo campi esito).
- Editing dei campi **foto** (e relativo upload) dal dettaglio ufficio.
- Auto-aggancio voce↔intervento per voci scollegate (resta nella route operatore).
- Audit trail dettagliato (chi/quando) oltre al bump di `updated_at`.
- Modifica dello `stato` del rapportino (resta `inviato`).
