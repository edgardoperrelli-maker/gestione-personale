# Handoff — 2026-07-20: Motore Gruppo attività (fase 1+2) IN PRODUZIONE

**Generated**: 2026-07-20 ~16:10 · **Branch**: `main` (= produzione Vercel, deploy live 15:59) · **Status**: CONCLUSO — fase 1 (PR #113) e fase 2 (PR #115) mergiate, deployate e verificate E2E. Restano solo follow-up minori tracciati.

## Goal

Partito da: "perché l'agente non ha riportato gli interventi del 17/07 sul master Labico?" → diagnosi silent-drop → costruito il **motore tassonomia attività** (fonte di verità unica `attivita_tassonomia`) con guardrail su tutti i punti d'ingresso, e (fase 2) filtro export dell'agente sul gruppo + UI self-service. Base dichiarata della prossima feature dell'utente.

## Completed

- [x] **Diagnosi**: 122 interventi Labico 17/07 (`committente='acea'`, `intervento_tipo` VUOTO, `created_from_mappa`) invisibili al filtro export testuale. Causa a monte: parser che non riconosceva "Operazione testo breve" + travaso manuale dal master per-comune (che non ha colonna attività).
- [x] **Backfill immediato** dei 122 (tipo='Limitazione Massiva su Impianto') — esiti verificati sui rapportini (52 eseguito / 70 No reali, nessun positivo nascosto).
- [x] **Fase 1 (PR #113)**: tabella `attivita_tassonomia` (69 voci; chiave = `attivita_norm` SQL ≡ `normalizzaAttivita` TS), colonna `interventi.gruppo_attivita` + backfill/canonicalizzazione/fix committente (alias produzione clonati), guardrail MAPPA (rifiuto totale con `ModaleErroreImport` se il file ha attività non conformi; lookup con committente 'altro' perché dalla mappa passano anche file Italgas), template server con Leggenda dal DB, select obbligatoria su TUTTI i percorsi manuali (+400 server con retro-compat coda offline), derivazione soft in pianificazione + dedup `identitaIntervento` normalizzata, Guard 2.
- [x] **Fase 2 (PR #115)**: export `app/api/export/limitazioni-massive` seleziona per `.eq('gruppo_attivita','LIMITAZIONI MASSIVE')` (−256 contaminazioni DUNNING da omonimia ilike, 0 massive perse); pagina **Impostazioni → Tassonomia attività** (aggiungi/attiva-disattiva/elimina-se-inutilizzata, NO rename by design) + API `admin/attivita-tassonomia`; Guard 3 (gruppi massiva-like ≠ literal).
- [x] Post-merge verificato: Guard 1=0, Guard 2=11 (sole italgas tipo-vuoto note, buco soft voluto), Guard 3=0; **E2E endpoint deployato con chiave agente: 1064 righe = DB esatto** (929 eseguito + 135 No).
- [x] Chip chiuso: `scanColonne.stamp` gitignorato e untracked (`bf7a543`).

## Not Yet Done (follow-up minori, tutti fail-safe, nessuno urgente)

- [ ] Guardrail UI: impedire (o confermare fortemente) la disattivazione della voce acea "LIMITAZIONI MASSIVE" — l'export si àncora a quel literal (Guard 3 copre il typo, non la disattivazione).
- [ ] Divergenza mappa: guardrail valida con 'altro' ma `planInterventi` persiste con committente 'acea' → file Italgas via mappa producono `gruppo_attivita=NULL` (visibili in Guard 2). Si chiude decidendo il committente per-file o in una fase 3.
- [ ] `validaImport` gira prima del filtro S-AI-051 in `MappaOperatoriClient` (rifiuto strict-safe di righe che sarebbero comunque scartate).
- [ ] Idempotenza dopo l'obbligo in `/api/r/[token]/intervento-manuale` (re-invio di già-persistito con attività legacy → chip bloccato spurio, nessuna perdita).
- [ ] `caricaTassonomia` senza `.range()` (cap PostgREST 1000, latente a 69 righe); `utilizzoVoce` match esatto vs normalizzato; POST dup su message-regex vs `code==='23505'`; PATCH senza 404; Guard 2 con data fissa 2026-07-20 (accumula).
- [ ] Nota fase 1: richieste manuali pendenti senza attività classificabile bloccano all'approvazione finché l'ufficio non sceglie dalla select (VOLUTO, non bug).

## Failed Approaches (Don't Repeat These)

- **Guardrail sulla pagina import (Task 7 originale)**: `app/hub/interventi` NON ha più l'upload — la pagina import fu rimossa a giugno (`90a870e`); l'endpoint `/api/interventi/import` è orfano (hardening 422 mantenuto comunque). I file si caricano SOLO dalla mappa ("+ aggiungi interventi" → Carica Excel / Scarica Template): il guardrail vive LÌ.
- **Riclassificazione `lim_massive`→`acea`**: SCARTATA deliberatamente (decisione fase 2). Tocca ~20 file con semantiche vive e utili (anagrafica leggera del "+", cerca-matricola, blocco duplicati, produzione); col filtro su gruppo non compra nulla — `attivitaCanonica` già riclassifica per i KPI. `committente='lim_massive'` resta un marcatore di canale documentato.
- **UPDATE prod via `execute_sql`**: il classifier lo blocca a volte; la via sanzionata e sempre passata è `apply_migration` con nome descrittivo (SQL idempotente).
- **Import statico di `caricaTassonomia` fuori da Next**: `'server-only'` non esiste come pacchetto reale → crash sotto `tsx` (script backfill). Soluzione in `ensureInterventiForPiano`: **import dinamico dentro try/catch** (best-effort, degrada a soft).
- **Validazione attività legata al template**: primo giro del Task 10 la richiedeva incondizionatamente ma la select era renderizzata solo se il campo era nel template → corsia manuale italgas completamente bloccata (il template italgas non ha il campo). Fix: la select tassonomia è SEMPRE renderizzata, indipendente da `info_campi`.

## Key Decisions

| Decision | Rationale |
|---|---|
| Chiave normalizzazione = `normalizzaAttivita` (upper, spazi, senza accenti) | Stessa chiave del listino/alias: zero doppioni; SQL `attivita_norm` speculare |
| Mappa: rigoroso solo se il file porta attività; legacy → soft + Guard | Non bloccare mai la pianificazione quotidiana per un formato vecchio |
| Lookup mappa con committente 'altro' | Dalla mappa passano anche file ATTGIORN Italgas: rifiutarli sarebbe un bug |
| No rename in UI tassonomia | La descrizione canonica è referenziata dallo storico: rinominare = nuova voce + disattiva vecchia |
| Blocco duplicati resta con l'OR largo (`approva/route.ts:100`) | Un contatore già limitato dal DUNNING deve bloccare un doppio "+" massivo |

## Current State

**Working**: tutto il motore in prod, E2E verificato. L'agente lim-sync (gira da QUESTO repo, tick da scheduler) riceve dal filtro nuovo già stasera; Guard 1+2+3 in `tools/limitazioni-sync/guard-limitazioni-non-esportate.sql` (eseguire dopo ogni import ACEA; attese: 0 / 11-note / 0).

**Uncommitted changes (NON di questa sessione — sessione concorrente in corso, NON toccare)**: `tools/limitazioni-sync/{agente.mjs, config.example.json, probe.cjs}` + nuovi `lib/risolviPathConfig.*`, `scriviLog.test.ts` — filone "commessa rinominata" (memoria `acea-commessa-rinominata-path-config`).

## Files to Know

| File | Perché |
|---|---|
| `lib/attivita/tassonomia.ts` | Lookup puro: `risolviGruppo`, `committenteEquivalente` (lim_massive→acea), `chiaveTassonomia` |
| `lib/attivita/validaImport.ts` | Verdetto import: un errore → rifiuto TOTALE, errori strutturati per la modale |
| `app/api/export/limitazioni-massive/route.ts` | Filtro agente: `.eq('gruppo_attivita','LIMITAZIONI MASSIVE')` |
| `app/api/admin/attivita-tassonomia/route.ts` + `app/impostazioni/attivita-tassonomia/` | UI self-service tassonomia |
| `components/modules/mappa/MappaOperatoriClient.tsx` | Guardrail sui 2 siti `parseExcelToTasks` + `downloadTemplate` → server |
| `tools/limitazioni-sync/guard-limitazioni-non-esportate.sql` | Guard 1+2+3 (runbook post-import) |
| `supabase/migrations/2026072015*/16*` | Schema+seed, backfill, completamento DUNNING (tutte GIÀ APPLICATE in prod) |
| `.superpowers/sdd/progress.md` | Ledger completo dei 2 cicli SDD (locale, gitignorato) |

## Code Context

```typescript
// lib/attivita/tassonomia.ts — il cuore
risolviGruppo(committente, descrizione, index) // → TassonomiaRiga | null; 'altro' prova acea→italgas
buildTassonomiaIndex(righe)                    // Map, solo attive; chiave `${committenteEq}|${descrizioneNorm}`
// SQL speculare: attivita_norm(s) = upper(regexp_replace(unaccent(trim(s)),'\s+',' ','g'))
```

```sql
-- Aggiungere un'attività legittima rifiutata dalla mappa (zero deploy) — o dalla UI Impostazioni:
insert into attivita_tassonomia (committente, descrizione, gruppo) values ('acea', 'Nuova Attività', 'DUNNING');
```

## Resume Instructions

1. **Salute del motore**: eseguire le 3 guard di `tools/limitazioni-sync/guard-limitazioni-non-esportate.sql` su Supabase. Atteso: G1=0, G2=11 righe italgas tipo-vuoto (fisso storico), G3=0. Righe NUOVE in G2 = un flusso scrive senza gruppo (probabile: file Italgas via mappa, follow-up noto).
2. **Se la mappa rifiuta un file legittimo**: la modale elenca i valori sconosciuti; aggiungere la voce da Impostazioni → Tassonomia attività (o INSERT sopra) e ricaricare il file. Successo di riferimento: 9 attività DUNNING aggiunte così il 20/07.
3. **Prossima feature dell'utente**: dichiarata "sulla base di questo motore", non ancora specificata. Modello dati pronto: `interventi.gruppo_attivita` + tassonomia interrogabile via `GET /api/attivita-tassonomia`.
4. Giro agente serale del 20/07: verificare in `/hub/agente` che il report non segnali anomalie (lavori≈1064 in finestra).

## Warnings

- **NON disattivare** la voce acea "LIMITAZIONI MASSIVE" dalla UI: l'export si àncora a quel literal.
- Repo PUBBLICO: mai committare chiavi (la export key sta in `tools/limitazioni-sync/config.json`, gitignorato), nomi operatori, matricole/ODL reali.
- L'agente gira da questo repo: dopo ogni merge che tocca `tools/limitazioni-sync` serve `git pull` qui (fatto oggi).
- Le migration di sessione sono GIÀ applicate in prod: ri-applicarle è safe (idempotenti) ma inutile.
- Spec/piani: `docs/superpowers/{specs,plans}/2026-07-20-*`; sintesi viva in memoria `motore-gruppo-attivita.md`.
