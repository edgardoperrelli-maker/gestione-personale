# Spec — Fase 2-A: Agenda operatore (template-driven)

Data: 2026-06-03
Stato: approvata per implementazione (modalità autonoma su richiesta utente)

## Obiettivo

Dare a ogni operatore una pagina web (link dedicato) con gli **interventi assegnati del suo giorno** e due soli pulsanti per chiuderli: **✅ Fatto** / **❌ Non fatto** (con causale). L'azione aggiorna lo stato/esito dell'intervento, alimentando i KPI. Il sistema deve essere **multi-commessa**: campi mostrati ed esiti disponibili derivano dal **template** associato all'intervento, scelto in fase di assegnazione — niente cablato su Acea.

## Contesto (stato attuale)

- `interventi`: ha `staff_id`, `data`, `stato`, `esito`, `esito_motivo`, `committente` (`acea|italgas|altro`), anagrafica. Indice `(data, staff_id)`. **Non** ha `template_id`.
- Macchina a stati `lib/interventi/statoInterventi.ts`: `assegnato` **non** transita direttamente a `completato`.
- Esiti hardcoded Acea (enum TS + CHECK DB).
- Sistema template (chat parallela): `rapportino_template` con `campi` + `info_campi`; modulo sorgente-di-verità `utils/rapportini/infoCampi.ts` (`resolve…` + fallback + snapshot). Da **riusare come pattern**.
- Accesso pubblico via token già esistente per i rapportini (`/r/[token]`): modello di riferimento per `/agenda/[token]`.

## Decisioni di design

1. **Accesso** — rotta pubblica `/agenda/[token]` (non protetta dal middleware, come `/r`). Token per `(staff_id, data)`.
2. **Token storage** — nuova tabella `agenda_token (id, staff_id, data, token unique, created_at, unique(staff_id,data))`. Il token è generato/garantito quando si **assegnano** interventi a un operatore per un giorno.
3. **Template ↔ intervento** — nuova colonna `interventi.template_id uuid references rapportino_template(id) on delete set null`. Scelto in assegnazione; default = template `is_default`.
4. **Esiti per commessa** — nuovo modulo `lib/interventi/esitiCommessa.ts` (gemello di `infoCampi.ts`):
   - `EsitoConfig = { chiave: EsitoIntervento; etichetta: string; richiedeMotivo: boolean }`.
   - `esitiPerCommessa(committente)` → `{ ok: EsitoConfig; causali: EsitoConfig[] }` con **fallback** a un set default.
   - Acea: `ok = eseguito_positivo`; causali = `accesso_negato, contatore_non_trovato, dati_ubicazione_insufficienti, accesso_a_vuoto, rinviato`.
   - Default (italgas/altro): `ok = eseguito_positivo`; causali = `accesso_negato, accesso_a_vuoto, rinviato`.
   - Tutti gli esiti usati appartengono all'enum DB esistente → **nessuna migration sull'enum**.
5. **Mapping pulsanti**:
   - *Fatto* → `stato=completato`, `esito=eseguito_positivo`, `chiuso_at=now()`.
   - *Non fatto* → scelta causale (dalle `causali` della commessa) + `esito_motivo` (obbligatorio se `richiedeMotivo`) → `stato=completato`, `esito=causale`, `chiuso_at=now()`.
6. **Transizione** — aggiungere `assegnato → completato` in `TRANSIZIONI`. (`in_viaggio/sul_posto/in_esecuzione` restano per l'app desktop, l'operatore non li usa.)
7. **Reversibilità** — entro la giornata (`data = oggi` e token valido) l'operatore può cambiare l'esito di un intervento già chiuso. Gestita in API come **ri-registrazione esito** su intervento `completato` (non si riapre lo stato). Fuori dalla giornata: sola lettura.
8. **Anagrafica mostrata** — per ogni intervento si mostra un sottoinsieme anagrafico essenziale (nominativo, indirizzo, comune, pdr, fascia_oraria). L'uso di `info_campi` del template per personalizzare le colonne è un **follow-up** (l'agenda lavora su `interventi`, non su `rapportino_voci`).

## Architettura

### Moduli (logica pura, testabili senza DB)
- `lib/interventi/esitiCommessa.ts` — catalogo esiti per commessa + resolve/fallback.
- `lib/interventi/statoInterventi.ts` — aggiunta transizione `assegnato→completato`; nuova helper `pianificaChiusuraOperatore({ statoCorrente, committente, azione: 'fatto'|'non_fatto', causale?, motivo? })` che valida e ritorna il patch `{ stato, esito, esito_motivo, chiuso_at }` o un errore.
- `lib/interventi/agendaToken.ts` — generazione token (stringa random) e helper di lookup.

### Dati (migration nuove — file committati, applicate dall'utente)
- `interventi.template_id`.
- tabella `agenda_token`.

### API
- `POST /api/interventi/assegna` — estendere: accetta `templateId`; scrive `interventi.template_id`; garantisce `agenda_token` per ogni `(staff_id, data)` coinvolto.
- `GET /api/agenda/[token]` (o server component) — risolve token → `(staff_id, data)` → interventi del giorno.
- `POST /api/agenda/[token]/intervento` — body `{ interventoId, azione, causale?, motivo? }`; valida token↔intervento (stesso staff_id+data), applica `pianificaChiusuraOperatore`, aggiorna l'intervento. Gestisce reversibilità entro giornata.

### UI
- `app/agenda/[token]/page.tsx` — server component (stile standalone come `/r/[token]`): header (operatore, data), lista card intervento con badge stato/esito, pulsanti Fatto/Non fatto; bottom-sheet causali per "Non fatto".
- `components/modules/interventi/InterventiAssegnabili.tsx` — aggiungere select template accanto al select operatore.

## Sicurezza
- Token random lungo (≥ 32 char). L'API consente scrittura solo sugli interventi del `(staff_id, data)` del token. Nessun dato di altri operatori esposto.

## Retrocompatibilità
- `interventi.template_id` nullable → interventi esistenti non si rompono; in lettura, template assente ⇒ esiti default per commessa.
- Aggiunta della transizione non rimuove le esistenti.

## Test (vitest, TDD)
- `esitiCommessa`: acea vs default, fallback, etichette, richiedeMotivo.
- `statoInterventi`: nuova transizione `assegnato→completato`; `pianificaChiusuraOperatore` (fatto/non_fatto, motivo obbligatorio, stato non valido).
- `agendaToken`: generazione/format.
- API: validazione token↔intervento, reversibilità entro giornata, rifiuto fuori giornata.

## Scope e fasi successive (per il resto del progetto)
- **2-A (questa spec)**: agenda operatore + template in assegnazione + esiti per commessa.
- **2-B**: torre di controllo realtime (board per operatore + mappa colorata, Supabase Realtime su `interventi`). Dipende da 2-A.
- **Backlog**: connettore Playwright (richiede credenziali portali + Allegato 1&2 — **bloccato da input esterno**); UI riconsegna misuratori (`misuratori_riconsegna`, penale €1.000); KPI premialità (`kpi_contratto`, regola in `lib/premialita/acea.ts`).
