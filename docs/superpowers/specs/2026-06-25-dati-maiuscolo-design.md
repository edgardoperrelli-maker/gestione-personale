# Dati operativi sempre in MAIUSCOLO

**Data:** 2026-06-25
**Stato:** Implementato (solo dati nuovi; migrazione esistenti da decidere a parte)

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

## Fuori scope (per ora)
- Migrazione dei dati **esistenti** (da fare a parte, con conteggio/anteprima).
- Configurazione (template/territori/attività/personale): non forzata in MAIUSCOLO.
