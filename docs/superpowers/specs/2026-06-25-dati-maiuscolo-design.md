# Dati sempre in MAIUSCOLO

**Data:** 2026-06-25
**Stato:** Implementato (dati nuovi) + migrazione storico ESEGUITA

## Obiettivo
Il testo inserito da **operatori** (smartphone/PC) e **backoffice** deve essere salvato sempre
in **MAIUSCOLO**, così il DB resta pulito e uniforme — anche se digitato in minuscolo l'app converte.

## Decisioni
1. **Doppio livello (client + server):**
   - **Client** (UX, "mentre si digita"): i campi di testo diventano subito MAIUSCOLI.
   - **Server** (garanzia): normalizzazione in MAIUSCOLO prima di scrivere su DB — copre anche
     l'offline ri-giocato e qualsiasi client non aggiornato.
2. **Solo dati operativi** (scelta utente): anagrafiche (nomi, indirizzi, codici PDR/ODL/matricola),
   note e risposte di **testo**. **Esclusa la configurazione**: template (nomi/etichette), territori,
   attività, e l'anagrafica del **personale/staff** (master data gestito dall'admin).
3. **Solo dati nuovi** (scelta utente): la regola vale da ora in poi; i dati già nel DB si valutano
   con una migrazione separata (conteggio/anteprima prima).
4. **Campi tecnici SEMPRE esclusi:** email, password, token, id/uuid, percorsi e nomi file foto
   (case-sensitive), chiavi JSON (`chiave`), enum di stato/committente, date, coordinate.
   - Per le **risposte** si toccano solo i campi `tipo === 'testo'`: select (opzioni fisse),
     crocetta (booleano), numero e foto (percorso) restano intatti.
   - Sicuro sui **codici**: l'aggancio voce→intervento normalizza già il case
     ([voceInterventoLink.ts](../../../lib/interventi/voceInterventoLink.ts) → `toLowerCase`),
     quindi maiuscolare ODL/matricola/PDR non rompe i collegamenti.

## Implementazione
- **Nuovo** [`lib/testo/maiuscolo.ts`](../../../lib/testo/maiuscolo.ts) (+test):
  - `maiuscolo(v)` — MAIUSCOLO di una stringa, null-safe (non-stringa invariato).
  - `maiuscolaStringhe(obj)` — tutti i valori stringa di primo livello (per l'anagrafica).
  - `maiuscolaRisposteTesto(risposte, campi)` — solo i valori dei campi `tipo === 'testo'`.
- **Client:** `CampoInput.tsx` (textarea testo libero), `ModaleInterventoManuale.tsx` (anagrafica).
- **Server:** `app/api/r/[token]/voce/route.ts` (risposte testo), `app/api/r/[token]/intervento-manuale/route.ts`
  (anagrafica + risposte testo + note), `app/api/admin/interventi-manuali/[id]/rifiuta/route.ts` (motivo).

## Ambito esteso (richiesta utente del 2026-06-25)
Oltre ai dati operatore, il MAIUSCOLO è stato esteso a **master backoffice** (personale,
territori, attività, hotel — **non** l'email) e alla **configurazione template** (nome +
etichette dei campi). `chiave`/`tipo`/`opzioni` restano sempre intatti.

## Migrazione dello storico (ESEGUITA 2026-06-25)
Eseguita sul progetto Supabase `aceztqfebringeaebvce`. **Backup** prima di ogni modifica nelle
tabelle `bak_maiusc_*` (id + colonne toccate) → rollback sempre possibile. Convertito:
- `rapportino_voci`: colonne anagrafica/codici + valori `risposte` di `tipo='testo'` (1074 voci).
- `rapportini`: `staff_name` + etichette in `campi_snapshot`/`info_snapshot` (248).
- `interventi_manuali`: `staff_name`, `note`, `motivo_rifiuto` + anagrafica/risposte-testo in
  `dati_operatore`/`dati_correnti` (378 anagrafiche) — `committente` preservato.
- `rapportino_template` (8), `staff` (28), `territories` (10), `activities` (12), `hotels` (7).

**Verifiche post-migrazione:** righe ancora minuscole = 0 ovunque; 1669/1669 percorsi foto
intatti (case-sensitive); opzioni select e enum `committente` invariati.

> I backup `bak_maiusc_*` restano nel DB finché non si conferma l'esito; poi si possono droppare.

## Sempre fuori scope
- Forzare MAIUSCOLO su `opzioni` dei select (devono combaciare con le risposte salvate).
