# Assegnazione AI — Storico assegnazioni + Avviso/blocco conflitto operatore — Design

**Data:** 2026-06-18
**Modulo:** `/hub/assegnazione-ai` (admin)
**Stato:** design approvato dall'utente, pronto per il piano di implementazione.

## Contesto e obiettivo

Il modulo Assegnazione AI (Fase 1+2, già in produzione) lascia premere **"Procedi"** per
trasformare le righe lette dal file in pianificazione (piano + interventi + rapportini),
riusando `sincronizzaRapportini`/`ensureInterventiForPiano`. La review finale di Fase 2 ha
segnalato due lacune che questi due follow-up chiudono:

1. **Storico delle assegnazioni fatte** — niente memoria di cosa è già stato pianificato:
   non si vede se un giorno/comune è **già stato assegnato**.
2. **Conflitto operatore** — premere "Procedi" quando un operatore è **già pianificato** in
   quel comune+giorno crea una doppia pianificazione (o, con l'attuale `overwrite:'replace'`,
   sovrascrive in silenzio i rapportini esistenti).

Insieme chiudono il buco di idempotenza del re-run.

## Decisioni (confermate)

- **Conflitto = pianifica i liberi.** A "Procedi", per ogni gruppo (operatore, comune, giorno)
  si controlla con `rilevaConflitti`: gli operatori **già pianificati** in quel comune+giorno
  (su un altro piano) vengono **esclusi** dalla pianificazione (mai sovrascritti) e restituiti
  come **conflitti** nell'esito; gli operatori liberi vengono pianificati normalmente.
- **Storico su tabella dedicata** `assegnazione_ai_log` (append-only), una riga **per operatore
  effettivamente pianificato** a ogni "Procedi" andato a buon fine.

## Granularità del conflitto

`rilevaConflitti` (`utils/rapportini/rilevaConflitti.ts`, già esistente e usato da
`sincronizzaRapportini`) definisce il conflitto come: **stesso `staff_id` + stessa `data` +
stesso `territorio`** (normalizzato) su un piano **diverso**. Nel ponte Assegnazione AI il
`territorio` del piano coincide col **comune** del file. Quindi il conflitto è per
**(operatore, comune, giorno)** — esattamente il requisito dell'utente. Territorio mancante
non genera conflitto (comportamento nativo di `rilevaConflitti`).

## Modello dati — `assegnazione_ai_log`

Nuova tabella, una riga per operatore pianificato:

| colonna | tipo | note |
|---|---|---|
| `id` | `uuid` pk default `gen_random_uuid()` | |
| `data_pianificata` | `date not null` | il giorno pianificato |
| `comune` | `text not null` | = territorio del piano |
| `file` | `text` | es. `ZAGAROLO.xlsx` (per filtri futuri) |
| `staff_id` | `uuid` | operatore |
| `staff_name` | `text` | denormalizzato (i nomi non stanno in `profiles`) |
| `n_interventi` | `int not null default 0` | n. task assegnati a quell'operatore |
| `piano_id` | `uuid` (no FK) | tracciabilità; resta anche se il piano viene poi cancellato |
| `creato_da` | `uuid` | utente che ha premuto Procedi |
| `creato_il` | `timestamptz not null default now()` | |

- Indice su `(data_pianificata, comune)`.
- RLS: `enable row level security` + policy `for all to authenticated using(true) with check(true)`
  (coerente con `agente_pianificabili` / `agente_file_config`).
- **Nessuna FK** verso `mappa_piani`: il log è un audit, deve sopravvivere alla
  cancellazione/sostituzione del piano.
- Scrittura **best-effort**: se l'insert fallisce, il piano resta valido e si aggiunge un
  avviso (la correttezza del blocco conflitti NON dipende dal log — vedi sotto).

Migration: `supabase/migrations/20260618120000_assegnazione_ai_log.sql` (1 sola SQL, lanciata
dall'utente).

## Helper puri (testabili in isolamento)

### `lib/agente/partizionaConflitti.ts`
Wrapper sottile su `rilevaConflitti` (nessuna logica duplicata):

```ts
import { rilevaConflitti, type RapEsistente, type Conflitto } from '@/utils/rapportini/rilevaConflitti';

export type OperatoreConflitto = { staff_id: string; staff_name: string | null };

export function partizionaConflitti(args: {
  operatori: OperatoreConflitto[];
  data: string;
  comune: string;
  esistenti: RapEsistente[];
}): { liberi: OperatoreConflitto[]; inConflitto: Conflitto[] } {
  const inConflitto = rilevaConflitti({
    pianoId: '',            // il nuovo piano non esiste ancora: nessuna esclusione per pianoId
    territorio: args.comune,
    data: args.data,
    operatori: args.operatori,
    esistenti: args.esistenti,
  });
  const idsKO = new Set(inConflitto.map((c) => c.staff_id));
  const liberi = args.operatori.filter((o) => !idsKO.has(o.staff_id));
  return { liberi, inConflitto };
}
```

### `lib/agente/caricaRapportiniEsistenti.ts`
Caricamento dei rapportini "esistenti" nella forma `RapEsistente[]` attesa da `rilevaConflitti`.
**Nota importante:** la tabella `rapportini` **non** ha la colonna `territorio`; il territorio
si risolve via join su `mappa_piani` (campo `terrByPiano`), esattamente come fa già
`sincronizzaRapportini`. Si replica quel pattern in un helper dedicato per **non** toccare la
funzione critica `sincronizzaRapportini`:

```ts
import type { RapEsistente } from '@/utils/rapportini/rilevaConflitti';

// db = client supabase; ristretto agli staffIds da pianificare per efficienza.
export async function caricaRapportiniEsistenti(
  db: any, data: string, staffIds: string[],
): Promise<RapEsistente[]> {
  if (staffIds.length === 0) return [];
  const { data: raps, error } = await db
    .from('rapportini').select('id, staff_id, piano_id, data, stato, submitted_at')
    .eq('data', data).in('staff_id', staffIds);
  if (error) throw error;
  const pianoIds = [...new Set((raps ?? []).map((r: any) => r.piano_id as string))];
  const terrByPiano: Record<string, string | null> = {};
  if (pianoIds.length) {
    const { data: piani, error: ePiani } = await db.from('mappa_piani').select('id, territorio').in('id', pianoIds);
    if (ePiani) throw ePiani;
    (piani ?? []).forEach((p: { id: string; territorio: string | null }) => { terrByPiano[p.id] = p.territorio ?? null; });
  }
  return (raps ?? []).map((r: any) => ({
    id: String(r.id), staff_id: String(r.staff_id), piano_id: String(r.piano_id),
    territorio: terrByPiano[r.piano_id as string] ?? null, data: String(r.data),
    stato: String(r.stato), submitted_at: (r.submitted_at as string | null) ?? null,
  }));
}
```

### `lib/agente/costruisciLogRows.ts`
Costruisce le righe del log per gli operatori effettivamente pianificati:

```ts
import type { OperatorePianoDaCreare } from '@/lib/agente/raggruppaPerPiano';

export function costruisciLogRows(args: {
  data: string; comune: string; file: string;
  pianoId: string; userId: string; operatori: OperatorePianoDaCreare[];
}) {
  return args.operatori.map((o) => ({
    data_pianificata: args.data,
    comune: args.comune,
    file: args.file,
    staff_id: o.staffId,
    staff_name: o.staffName,
    n_interventi: o.tasks.length,
    piano_id: args.pianoId,
    creato_da: args.userId,
  }));
}
```

## Modifiche all'endpoint `POST /api/admin/agente/assegna`

Il flusso per ogni piano-da-creare (`raggruppaPerPiano`) diventa, dopo l'anti-dup esistente e
**prima** di creare il piano:

1. Carica i **rapportini esistenti** per `p.data` con `caricaRapportiniEsistenti(db, p.data,
   staffIds)` (ristretto agli `staff_id` da pianificare). Il territorio è risolto via join su
   `mappa_piani`; il match comune↔territorio (normalizzato) è poi delegato a `rilevaConflitti`.
2. `partizionaConflitti({ operatori, data: p.data, comune: p.comune, esistenti })` →
   `{ liberi, inConflitto }`.
3. Gli `inConflitto` confluiscono in un nuovo array di risposta `conflitti[]`
   `{ staff_name, comune, data, submitted }` e **non vengono pianificati**.
4. Se `liberi` è vuoto → **salta** il piano (nessun `mappa_piani` creato), continua.
5. Crea il piano con i **soli `liberi`** (`mappa_piani_operatori` filtrato sugli operatori liberi).
6. Chiama `sincronizzaRapportini(pianoId, { templateId })` **senza** `overwrite:'replace'`
   (i conflitti sono già esclusi a monte; un eventuale 409 residuo da race emerge come avviso,
   non come sovrascrittura silenziosa).
7. Su successo: scrivi le righe del log con `costruisciLogRows(...)` (best-effort: se l'insert
   fallisce, aggiungi un avviso, non fare rollback del piano).

**Fail-safe:** se la query dei rapportini esistenti fallisce, si **salta** quel piano con
avviso (zero margine d'errore: non pianificare alla cieca).

La risposta dell'endpoint diventa:
`{ ok, pianiCreati, rapportiniCreati, nonRisolti, conflitti, avvisi }`.

## Endpoint storico — `GET /api/admin/agente/assegnazioni`

- `requireAdmin`.
- Querystring opzionale `?data=YYYY-MM-DD` (filtro per `data_pianificata`).
- Ritorna le righe del log ordinate per `creato_il desc`, limitate alle ultime ~100.
- Forma: `{ righe: [{ data_pianificata, comune, file, staff_name, n_interventi, creato_il }] }`.

## UI — `AssegnazioneAiClient`

- **Sezione "Storico assegnazioni"**: tabella `Giorno / Comune / Operatore / N. interventi /
  Creato il`. Caricata all'apertura del modulo e **ricaricata dopo "Procedi"**. Quando è
  selezionato un giorno, la sezione **filtra su quel giorno** (così "vedi subito se è già stata
  fatta").
- **Pannello esito di "Procedi"**: oltre a `pianiCreati`/`rapportiniCreati` (verde) e
  `nonRisolti`/`avvisi` (come ora), mostra in **giallo** i `conflitti`: "⚠️ Non assegnati (già
  pianificati): NOME a COMUNE il GG/MM".

## Gestione errori

- **Log non scritto**: best-effort + avviso; il piano resta valido (il blocco conflitti usa lo
  stato live dei rapportini, non il log).
- **Query rapportini esistenti fallita**: salta il piano con avviso (fail-safe).
- **Tutti gli operatori in conflitto**: piano non creato; i conflitti sono in `conflitti[]`.

## Test

- `partizionaConflitti`: operatore con rapportino stesso giorno+comune su altro piano →
  `inConflitto`; comune diverso → `libero`; nessun esistente → tutti `liberi`; territorio
  vuoto → nessun conflitto (delega a `rilevaConflitti`).
- `costruisciLogRows`: `n_interventi` = `tasks.length`, campi mappati correttamente, una riga
  per operatore.
- L'endpoint resta sottile (orchestrazione); la logica vive negli helper puri testati, coerente
  col resto del modulo.

## Struttura file (unità)

- **Nuovi:** `lib/agente/partizionaConflitti.ts` (+test), `lib/agente/costruisciLogRows.ts`
  (+test), `lib/agente/caricaRapportiniEsistenti.ts` (I/O sottile, replica il pattern di
  `sincronizzaRapportini`), `app/api/admin/agente/assegnazioni/route.ts` (GET storico),
  `supabase/migrations/20260618120000_assegnazione_ai_log.sql`.
- **Modificati:** `app/api/admin/agente/assegna/route.ts` (pre-check conflitti + log + risposta
  `conflitti`), `components/modules/assegnazione-ai/AssegnazioneAiClient.tsx` (sezione storico +
  conflitti nel pannello esito).
- **Riusati senza modifiche:** `utils/rapportini/rilevaConflitti.ts`,
  `lib/agente/raggruppaPerPiano.ts`, `lib/interventi/sincronizzaRapportini.ts`.

## Fuori scope (YAGNI)

- Aggiornamento `mappa_distribuzioni` (conteggi cronoprogramma) — follow-up separato già noto.
- Idempotenza "ripristina lo stesso piano" — il blocco conflitti + lo storico bastano allo scopo.
- Anti-dup scoped al file — benigno con singolo file (ZAGAROLO).
