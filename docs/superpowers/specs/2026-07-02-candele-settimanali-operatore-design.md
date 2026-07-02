# Candele settimanali per operatore — Design

**Data**: 2026-07-02
**Stato**: approvato a voce dall'utente (sessione 02/07), in attesa di review scritta
**Contesto**: segue PR #67 (dashboard direzione) e PR #68 (personale feriale + esiti). L'utente chiede un "grafico a candele con assegnazione giornaliera e % di esito" nel blocco Personale.

## Obiettivo

Un grafico settimanale (7 giorni, navigabile) che mostri, **per ogni operatore**, come sono andate le sue giornate: quanti interventi ACEA aveva assegnati ogni giorno, come si sono chiusi (positivo/negativo/mai lavorato), e quanto ha prodotto in €. Serve a intercettare pattern che i grafici aggregati sull'intero periodo (Esiti-operatore, Personale) non mostrano: *quando* un operatore ha avuto una giornata storta, non solo *quanto* in totale.

## Perché "a candele" e cosa significa qui

In finanza una candela mostra apertura/massimo/minimo/chiusura di un prezzo. Qui non c'è un prezzo, quindi la forma visiva (barra con corpo colorato) viene riusata con un significato diverso, deciso insieme all'utente attraverso un brainstorming dedicato (vedi Decisioni sotto). Non è una vera candela OHLC: è una barra impilata con la stessa estetica.

## Decisioni (dal brainstorming con l'utente)

| Decisione | Scelta | Rationale |
|---|---|---|
| Cosa rappresenta la candela | Corpo = **conteggio** interventi ACEA assegnati quel giorno a quell'operatore, impilato in 3 segmenti REALI (non normalizzati a 100%): verde=positivi, rosso=negativi, grigio=non lavorati | Prima ipotesi (altezza=€, colorata a fette) era matematicamente contraddittoria: negativi/non-lavorati producono sempre 0€ in questo sistema, quindi le fette rosso/grigio avrebbero altezza zero se l'asse fosse €. Il conteggio non ha questo problema e resta un fatto vero (nessuna stima) |
| Dove va l'€ | **Solo nel tooltip** (non come etichetta sempre visibile) | Con 9 operatori × 7 giorni, 63 etichette sempre visibili sarebbero illeggibili |
| Base dei 3 segmenti | Ogni riga ACEA-effettiva assegnata all'operatore quel giorno, **senza dedup matricola**, **senza saracinesche master** | Stessa regola di `aggregaEsiti` (PR #68): i segmenti misurano carico operativo, non fatturato |
| € nel tooltip | Somma delle righe **DEDUP per matricola** (stessa regola della card Produzione) | L'€ deve essere un fatturato reale, non gonfiato dalle limitazioni massive ripetute |
| Filtro riga | Stesso filtro di produzione/esiti: `attivitaCanonica(...).committenteEff === 'acea' && attivo` | Coerenza con tutto il resto del modulo (stessa riclassificazione gas→italgas, stesse attività scartate) |
| Periodo | Settimana **lunedì–domenica** (ISO), navigabile con frecce ← →, MAI più di 7 giorni | Scelta esplicita dell'utente: filtro scollegato dal periodo mensile della pagina |
| Default | Settimana che contiene "oggi" | Nessun'altra indicazione data; i giorni futuri della settimana corrente mostreranno naturalmente zero (nessun caso speciale) |
| Livello di aggregazione | **Piccoli multipli**: una riga per operatore, tutti visibili insieme nella settimana selezionata | Con soli 7 giorni per riga è leggibile anche con 9+ operatori (a differenza di una vista mensile, scartata per l'affollamento) |
| Fonte dati | **Endpoint dedicato** `GET /api/admin/acea/produzione/candele?from&to`, fetch indipendente dal resto della pagina | Il payload principale non deve gonfiarsi con un dettaglio operatore×giorno che serve solo qui; il filtro è esplicitamente scollegato dal periodo di pagina |
| Componente | `CandeleSettimanali.tsx` **non prende `dati` come prop** (diverso da tutti gli altri componenti di `economica/`) | Gestisce da solo stato-settimana e fetch; è un'eccezione voluta, va documentata nel codice perché non ovvia leggendo gli altri file della cartella |
| Dove vive | Tab **e** Presentazione, in fondo al blocco Personale | Richiesta esplicita dell'utente |
| Interattività in Presentazione | Le frecce **restano cliccabili** (uniche nella pagina — tutto il resto è statico) | Deroga esplicita alla regola "presentazione = sempre statica" fissata nel design precedente. Le frecce hanno `print:hidden`; il contenuto stampa sempre la settimana visibile al momento ("foto del momento e del filtro applicato", parole dell'utente) |
| Colori | Riuso di `cc.success` (verde) / `cc.danger` (rosso) / `cc.brandTextMuted` (grigio) — stessi della PR #68, nessun token nuovo | Coerenza visiva col grafico Esiti-operatore già esistente |

## Estrazione DRY: `lunediSettimana`

`serieTrend.ts` ha già una funzione privata `lunediDi(iso)` (lunedì ISO della settimana di un giorno) usata per `raggruppaPerSettimana`; `PersonaleImpegno.tsx` ha una copia inline della stessa logica per il suo aggregato settimanale. Questa feature è il **terzo** consumatore della stessa identica logica — esattamente il trigger già segnalato come follow-up nella review finale della PR #68 ("se un terzo consumer comparirà, estrarre lunediDiISO condiviso"). Si estrae in un nuovo file condiviso `lib/produzione/settimana.ts`:
- `lunediSettimana(iso: string): string` — lunedì ISO della settimana di `iso` (stessa implementazione UTC di `lunediDi`).
- `giorniSettimana(lunedi: string): string[]` — le 7 date ISO da `lunedi` a `lunedi+6` (nuova, serve solo qui).

`serieTrend.ts` e `PersonaleImpegno.tsx` vengono aggiornati per importare `lunediSettimana` da lì al posto delle loro copie private, senza cambiare il loro comportamento (stesso algoritmo, stesso risultato — verificato dai test esistenti che non cambiano).

## Architettura dati

### Modulo puro: `lib/produzione/aggregaCandele.ts`
```typescript
interface RigaCandela {
  staffId: string;
  operatore: string;
  data: string;        // 'YYYY-MM-DD'
  esitoOk: boolean | null;
  valoreDedup: number;  // € SOLO se la riga sopravvive al dedup matricola, 0 altrimenti
}
interface CandelaGiorno { data: string; positivi: number; negativi: number; nonLavorati: number; assegnati: number; valore: number }
interface CandelaOperatore { chiave: string; label: string; giorni: CandelaGiorno[] }

function aggregaCandele(righe: RigaCandela[], settimana: string[]): CandelaOperatore[]
```
`settimana` (i 7 giorni ISO) garantisce che ogni operatore abbia sempre 7 `CandelaGiorno` anche nei giorni a zero (niente buchi nell'asse X). Ordinamento operatori: per totale `assegnati` nella settimana, desc.

### Loader: nuovo file `lib/produzione/loadCandele.ts`
`caricaCandeleSettimanali(from: string, to: string): Promise<{ from: string; to: string; operatori: CandelaOperatore[] }>` — query leggera e indipendente dal loader principale:
1. Carica `interventi` (committente IN `['acea','lim_massive']` — costante duplicata localmente, 2 elementi, non vale la pena importarla da `load.ts` e accoppiare i due loader), `acea_listino`, `acea_attivita_alias`, nomi staff — sottoinsieme delle query già in `load.ts` (stesso pattern, loader indipendente, nessuna dipendenza incrociata con `caricaProduzioneEconomica`). Serve anche un `valore(attivitaKey, data)` locale (stesso closure pattern di `load.ts`: `prezzoPerData` + `valoreRiga` sul listino caricato).
2. Per ogni riga: stessa `attivitaCanonica` (filtro `committenteEff==='acea' && attivo`), stesso `esitoOkDaIntervento`. Costruisce SEMPRE una `RigaCandela` (per i conteggi, riga per riga, senza dedup).
3. **Solo per le righe con `esitoOk===true`**, costruisce ANCHE una riga nel formato `RigaProduzione` di `aggregaProduzione.ts` (richiede `matricola`, `attivitaKey`, `valore`, oltre a `staffId`/`data`) e la passa a `deduplicaMassivePerMatricola` (riusata, già esportata da `aggregaProduzione.ts`) insieme a tutte le altre righe positive della settimana. Le righe che SOPRAVVIVONO al dedup assegnano il loro `valore` alla `valoreDedup` della `RigaCandela` corrispondente (stesso staffId+data+odl); le righe scartate dal dedup restano a `valoreDedup=0` (ma continuano a contare nei conteggi `positivi`, costruiti al punto 2 indipendentemente dal dedup).
4. Chiama `aggregaCandele(righeCandela, giorniSettimana(from))`.

### API: nuovo file `app/api/admin/acea/produzione/candele/route.ts`
`GET ?from&to` (YYYY-MM-DD), `requireAdminPlus`. Validazione: formato date + `to - from ≤ 6 giorni` (7 giorni inclusi) → 400 se violato. Nessuna cache (`no-store`), stesso pattern delle route esistenti.

## UI

### `components/modules/performance/economica/CandeleSettimanali.tsx` (nuovo)
Client component **senza prop** (si autogestisce). Stato: `lunedi` (default = lunedì della settimana corrente, calcolato con `lunediSettimana(oggi)`), fetch a `/api/admin/acea/produzione/candele?from=lunedi&to=lunedi+6gg` ad ogni cambio.
- Header: `← Settimana del DD/MM – DD/MM →` (frecce `print:hidden`, spostano `lunedi` di ±7 giorni).
- Per ogni operatore in `operatori`: una riga con label + mini `BarChart` (Recharts), asse X = 7 giorni (etichette corte Lun–Dom via `giornoIT`), 3 `Bar` impilate (`stackId` condiviso, NON normalizzate — l'altezza varia col volume reale, a differenza di `EsitiOperatore`), colori `cc.success`/`cc.danger`/`cc.brandTextMuted`.
- Tooltip per barra: data estesa, positivi/negativi/non-lavorati, € (dedup).
- Empty state: "Nessun operatore con attività ACEA in questa settimana."
- Loading/errore: stesso pattern testuale degli altri fetch del modulo (vedi `PresentazioneProduzione.tsx`).

### Integrazione
- `PerformanceEconomica.tsx`: `<CandeleSettimanali />` dopo `<EsitiOperatore dati={dati} />`.
- `PresentazioneProduzione.tsx`: stessa posizione, dentro `<section className="break-inside-avoid">`. Nota nel footer invariata salvo eventuale menzione (facoltativa, non richiesta esplicitamente).

## Fuori scope
- Nessuna modifica al payload/endpoint principale (`/api/admin/acea/produzione`).
- Nessuna modifica a Excel (il dato candele non va esportato in questo giro — non richiesto).
- Nessuna gestione speciale dei giorni futuri (mostrano zero naturalmente, nessun placeholder "N/D").
- Nessuna gestione speciale del sabato/domenica qui (a differenza del blocco Personale-feriale): questa vista mostra tutti e 7 i giorni così come sono nei dati, senza la regola feriale/sabato/domenica della PR #68 (metriche diverse, scopi diversi).

## Casi limite
- Operatore con zero assegnati in TUTTA la settimana → non compare nell'elenco (coerente con `aggregaEsiti`, che include solo chi ha almeno una riga).
- Riga con `staffId` vuoto → scartata (stesso pattern di `aggregaEsiti`/`aggregaPersonale`).
- `to - from` non allineato a 7 giorni esatti (es. l'utente naviga a un lunedì ma la UI calcola male l'estremo) → l'endpoint valida comunque ≤6 giorni di differenza, indipendentemente da chi chiama.
- Settimana con zero interventi per TUTTI → empty state.
- **Stessa matricola (limitazione massiva) ripetuta in due giorni diversi della stessa settimana**: `deduplicaMassivePerMatricola` (comportamento ESISTENTE, non nuovo) tiene solo la PRIMA riga incontrata nell'ordine di iterazione (id crescente in DB, non necessariamente il primo giorno cronologico) e scarta le altre. Risultato: il conteggio `positivi` è corretto su ENTRAMBI i giorni (1 ciascuno), ma il `valore` € dedup va tutto al giorno "vincitore" — l'altro giorno mostra 0€ per quella riga pur avendo un esito positivo reale. Comportamento EREDITATO dalla funzione esistente (già così in Produzione economica), non un bug di questo loader: non va "corretto" qui, va solo capito in fase di test/review.

## Criteri di accettazione
1. Nuovo endpoint restituisce `operatori[].giorni` sempre a 7 elementi (uno per giorno della settimana richiesta), anche a zero.
2. I conteggi (positivi/negativi/nonLavorati) NON sono deduplicati; il valore € SÌ (dedup matricola) — verificabile con un caso di test con 2 righe stessa matricola: `assegnati` totale settimana = 2 (1 per riga, indipendentemente dal giorno), `valore` totale settimana = 1×prezzo (non 2×), ripartito secondo l'ordine di iterazione (vedi Casi limite).
3. Frecce cambiano la settimana di esattamente 7 giorni; il lunedì di partenza è sempre un lunedì.
4. Componente presente in tab e presentazione, stesso codice.
5. `lunediDi`/duplicato in `PersonaleImpegno.tsx` sostituiti dall'import condiviso, test esistenti (`serieTrend.test.ts`, nessun test diretto su `PersonaleImpegno`) invariati nell'esito.
6. Gate: tsc 0, vitest lib/produzione verde (nuovi test `aggregaCandele.test.ts` + `settimana.test.ts`), eslint 0 sui file toccati, build verde.

## Nota operativa
Come per le PR #67/#68: worktree da origin/main, spec+piano committati SUBITO nel worktree (rimossi dal checkout principale per non bloccare il pull post-merge), implementer floor = sonnet.
