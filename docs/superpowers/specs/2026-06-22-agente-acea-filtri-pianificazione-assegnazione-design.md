# Design — Fix filtri lettura ACEA: pianificazione (dunning) + assegnazione (stato odl)

**Data**: 2026-06-22
**Base**: `origin/main` (tutti i file toccati sono identici a origin/main; il driver anti-lock divergente NON viene toccato)
**Tipo**: bugfix mirato (no redesign — spec separata successiva)
**Riferimenti**: HANDOFF.md (2026-06-22), memorie `acea-assegna-driver-cerca`, `acea-assegnazione-blindata`

## 1. Problema

L'agente ACEA legge dai master gli interventi del giorno (`agente_pianificabili`) per due flussi:

1. **Pianificazione** → crea piani/rapportini in app ("Procedi").
2. **Assegnazione in blocco su ACEA** → l'app (`GET /api/agente/acea-assegnazioni`) prepara la lista `odl→operatore`, l'agente la passa al **driver Playwright** (verificato, anti-lock) che la scrive sul portale ("Scrivi su ACEA").

Due bug nella **selezione** delle righe:

- **Bug #2 (dunning, pianificazione).** Il master DUNNING viene letto da `mappaRigheMaster`, che **non legge la colonna di stato** e forza `esitoRaw=''` ([leggiMasterAcea.mjs:45](../../tools/limitazioni-sync/lib/acea/leggiMasterAcea.mjs)). Risultato: entrano in pianificazione anche gli interventi con `Stato Operazione = completato/annullato`.
- **Bug #1 (assegnazione).** La lista passata al driver non esclude gli stati **non assegnabili** (`completo`, `DA RICHIEDERE`): `assegnabiliAcea` scarta solo odl mancante / operatore non risolto / già assegnato / duplicato, **mai** per stato ordine.

## 2. Decisioni (confermate con l'utente)

| # | Decisione |
|---|-----------|
| D1 | "Leggere la colonna del 17 a priori" = **selezionare prima le righe del giorno** (colonna data). Nessuna colonna "17": era il *giorno*. |
| D2 | **Una sola lettura del master.** L'esito resta filtrato in import com'è ora (pianificazione invariata); si **aggiunge** lo scarto degli **stati chiusi** in import e si **porta `stato_odl`** fino ad `agente_pianificabili`; il filtro **non-assegnabili** si applica **in assegnazione** (a monte del driver). |
| D3 | **Pianificazione dunning**: escludi se `stato_odl` ∈ chiusi (`completato`/`annullato`). |
| D4 | **Assegnazione**: escludi se `stato_odl` ∈ {`completo`, `DA RICHIEDERE`} (l'esito **non** conta). I chiusi sono già fuori (scartati in import) → non assegnabili a maggior ragione. |
| D5 | **Confine intoccabile**: "al Playwright devono arrivare gli ordini già da lavorare; la logica che decide *cosa* dare a Playwright va fatta **a monte**". Driver/orchestratore/comandi PowerShell IDENTICI. |
| D6 | Insiemi di stati **configurabili** (liste normalizzate) con default sensati; valori esatti da validare sui file reali. |
| D7 | **Scope**: solo i due bug. Redesign del modulo = spec separata successiva. |

### Perché questo design è a basso rischio (dal nuovo handoff)
- Il **Dunning non ha colonna esito** → `esito` è sempre `''` → il filtro esito non rimuove righe Dunning: spostarlo a valle sarebbe inutile e rischioso. Lo lasciamo dov'è.
- **LM/Zagarolo non viene mai assegnato** (`acea-assegnazioni` esclude `attivita='LIMITAZIONI MASSIVE'`) → le sue righe non servono all'assegnazione: non tocchiamo la sua pianificazione.
- Per le righe LM, `stato_odl` resta `''` (la lettura LM non lo popola) → `isChiuso('')=false` → **nessun effetto sul flusso LM**. Lo scarto-chiusi colpisce di fatto solo il Dunning.

## 3. Modello di filtro

### Livello 1 — Import (lettura "a priori", per giorno)
`estraiPianificabili` (già: `data==giorno` AND `esecutore` presente AND `esito` vuoto) **aggiunge**:
- scarta se `isChiuso(statoOdl)` → esclude `completato`/`annullato`. **Fix bug #2.**
- propaga `statoOdl` nell'output (per le righe Dunning; `''` per LM).

`statoOdl` viene popolato **solo nel percorso Dunning** (`mappaRigheMaster`, per nome-config `acea.masterColonnaStato`); nel percorso LM resta `''` → comportamento LM invariato.

### Livello 2 — Assegnazione (a monte del driver)
`assegnabiliAcea` (già: scarta odl mancante / operatore non risolto / già assegnato / duplicato) **aggiunge**:
- scarta se `isNonAssegnabile(stato_odl)` → esclude `completo`/`DA RICHIEDERE` (motivo `'stato non assegnabile'`). **Fix bug #1.**

Il driver riceve la lista già filtrata e si comporta **esattamente come oggi**.

### Livello 3 — Pianificazione
**Invariata.** Consuma `agente_pianificabili` come adesso (i chiusi sono già fuori dall'import; `completo`/`DA RICHIEDERE` restano pianificabili — un ordine "da richiedere" si può pianificare anche se non è ancora assegnabile su ACEA).

### Normalizzazione confronto
`normStato(s)` = NFD/strip-accenti + lowercase + trim + collapse spazi. `matchStato(cella, lista)`: regola `equals` vs `includes` finalizzata dopo aver visto i valori distinti reali (default prudente: `includes` normalizzato; i token sono distintivi). I token `completo`/`completato` sono volutamente distinti.

## 4. Flusso dati

```
MASTER DUNNING (.xlsx) ──(agente: legge stato, scarta chiusi, porta stato_odl)──▶ agente_pianificabili(+stato_odl)
MASTER LM (.xlsx)      ──(agente: come oggi, stato_odl='')───────────────────────▶ agente_pianificabili(stato_odl='')
                                                                                          │
                       ┌──────────────────────────────────────────────────────────────────┴───────────────────┐
                       ▼ PIANIFICAZIONE (invariata)                              ▼ ASSEGNAZIONE (esclude LM)
              anteprima / Procedi → piani+rapportini        acea-assegnazioni → assegnabiliAcea(+isNonAssegnabile) → eseguiGiroAceaAssegna → DRIVER (INTOCCATO)
```

## 5. Modifiche per file

### A monte — Agente Node (solo LETTURA; NON il driver)
| File | Modifica | Hook |
|------|----------|------|
| `tools/limitazioni-sync/lib/statiOdl.mjs` *(nuovo, puro)* | `normStato`, `isChiuso`, default `STATI_CHIUSI=['completato','annullato']`. | — |
| `tools/limitazioni-sync/lib/acea/leggiMasterAcea.mjs` | `mappaRigheMaster`: risolvere `idx.stato = risolviColonna(header, colonne.stato)` e popolare `statoOdl` (resta `''` se la colonna non c'è). | ⚠️ protetto |
| `tools/limitazioni-sync/agente.mjs` | `leggiMasterAceaDunning`: aggiungere `stato: acea.masterColonnaStato` all'oggetto `colonne`. | — |
| `tools/limitazioni-sync/lib/pianificabili.mjs` | `estraiPianificabili`: dopo il check esito, `if (isChiuso(r.statoOdl)) continue;`; aggiungere `statoOdl: t(r.statoOdl)` all'output. | — |
| `tools/limitazioni-sync/lib/apiAgente.mjs` | `inviaPianificabili`: includere `statoOdl` (→ `stato_odl`) nel payload. | — |

> Nessun tocco a `assegnaInterventi.mjs`, `eseguiGiroAceaAssegna.mjs`, `driver.mjs`, `risolviNomeOperatore.mjs`, `assegna-odl.mjs`, né a `colonne.mjs`. Propagazione al PC via mirror Drive + robocopy (vedi §7).

### A valle — App (storage + selezione assegnazione)
| File | Modifica | Hook |
|------|----------|------|
| **Migration** `agente_pianificabili` | Aggiungere `stato_odl text` (nullable). SQL consegnata a parte, la lancia l'utente. | — |
| `app/api/agente/pianificabili/route.ts` | Ingest: salvare anche `stato_odl`. | — |
| `lib/agente/statoOdl.ts` *(nuovo, puro)* | `normStato`, `isNonAssegnabile`, default `STATI_NON_ASSEGNABILI=['completo','da richiedere']`. | — |
| `lib/agente/assegnabiliAcea.ts` | `InterventoAcea` + `stato_odl`; scartare righe con `isNonAssegnabile(stato_odl)` (motivo `'stato non assegnabile'`). | — |
| `app/api/agente/acea-assegnazioni/route.ts` | Selezionare `stato_odl`; passarlo a `assegnabiliAcea`. | ⚠️ protetto |

**Pianificazione (anteprima/assegna): NON toccata.**

## 6. Configurabilità degli stati

Default nei due helper (`tools/.../statiOdl.mjs` lato agente, `lib/agente/statoOdl.ts` lato app — runtime diversi, piccola duplicazione accettata):
```
STATI_CHIUSI           = ['completato', 'annullato']    // esclusi in IMPORT (pianificazione+assegnazione)
STATI_NON_ASSEGNABILI  = ['completo', 'da richiedere']  // esclusi in ASSEGNAZIONE
```
Override opzionale da `agente_config` (campi testo CSV) rinviato al redesign; per il bugfix i default bastano.

## 7. Operatività (dal handoff)

- **Branch**: worktree da `origin/main` (NON il branch `restyle/aurea-light`). Commit lì; per le parti app `git push origin <branch>:main` (refspec, con ok utente) → deploy Vercel.
- **Hook di blindatura**: modificare `leggiMasterAcea.mjs` e `acea-assegnazioni/route.ts` farà scattare il prompt di conferma di `guard-acea.mjs`. È voluto: confermo perché sono modifiche richieste esplicitamente dall'utente. NON aggirare l'hook.
- **Propagazione PC** (le modifiche `tools/` non vanno su Vercel): copiare i `tools/limitazioni-sync` aggiornati nel mirror `G:\Il mio Drive\limitazioni-sync-aggiornato`; l'utente lancia il robocopy verso il PC (`/XD node_modules ... /XF config.json acea.lock`). Senza questo passo il PC continua col vecchio filtro.
- **Migration**: SQL consegnata in chat su richiesta esplicita; la lancia l'utente (prod `aceztqfebringeaebvce`).

## 8. Da validare sui dati reali (non bloccante per il design)

- Valori **distinti reali** di `Stato Operazione` (DUNNING) → conferma `completo` vs `completato`, `DA RICHIEDERE` vs `DA CHIEDERE`, e scelta `equals` vs `includes`.
- Conferma che il master DUNNING **non** abbia colonna esito (atteso: no).
- Dry-run sul PC dopo robocopy + tick a 1 min, su un giorno con dati (es. 22/06).

## 9. Fuori scope

- **Driver/Playwright e comandi PowerShell** (`assegnaInterventi.mjs`, `assegna-odl.mjs`, `eseguiGiroAceaAssegna.mjs`, `driver.mjs`): intoccati (D5).
- **Pianificazione** (anteprima/Procedi): invariata.
- **Redesign** del modulo `/hub/assegnazione-ai`: spec separata successiva.
- Giro ACEA di **scrittura stato** (`aggiornaStatoXlsx`/`eseguiGiroAcea`): non coinvolto.

## 10. Test

- `statiOdl.mjs` / `statoOdl.ts`: normalizzazione accenti/maiuscole/spazi; `isChiuso`/`isNonAssegnabile` su default; cella vuota → `false`.
- `pianificabili`: scarta i chiusi, propaga `statoOdl`; riga con `statoOdl=''` (LM) **non** scartata → comportamento LM invariato; esito vuoto invariato.
- `mappaRigheMaster`: legge la colonna stato per nome-config → `statoOdl` popolato; assente → `''`.
- `assegnabiliAcea`: scarta `completo`/`DA RICHIEDERE` oltre agli scarti esistenti; preserva forma/ordine lista per il driver.
- Gate baseline: verde sui file toccati (`npx vitest run tools/limitazioni-sync` + nuovi test app).

## 11. Criteri di accettazione

1. **Pianificazione dunning**: intervento del giorno con `Stato Operazione = completato`/`annullato` **non** genera rapportino. ✅ bug #2.
2. **Pianificazione LM**: comportamento invariato (esito `eseguito` escluso; nessun nuovo scarto indebito).
3. **Assegnazione blocco**: ODL con `stato_odl ∈ {completo, DA RICHIEDERE}` **non** finiscono nella lista al driver; gli altri Dunning sì. ✅ bug #1.
4. **Driver/PowerShell**: nessuna modifica; `assegna-odl.mjs <odl> <cognome> reale` funziona come prima.
5. Anteprima/Procedi: nessun cambiamento di comportamento osservabile oltre l'esclusione dei chiusi dal Dunning.
