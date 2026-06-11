# Spostamento operatore in altro territorio — Design

Data: 2026-06-11
Stato: approvato (brainstorming)

## Problema

Nel Riepilogo rapportini (`/hub/mappa?vista=riepilogo`) gli operatori sono
raggruppati per **territorio**, che oggi è una proprietà del **piano**
(`mappa_piani.territorio`). Capita che operatori vadano spostati su un altro
territorio per la giornata (es. Pratesi e Ciarallo, nel piano "Firenze", vanno
in realtà su "ACEA"). Non esiste un modo per spostarli senza rifare il piano.

Requisito (deciso in brainstorming):
- Spostamento del **singolo operatore**, anche se condivide il piano con altri.
- L'effetto deve essere **coerente ovunque**: Riepilogo **e** board Live/torre
  **e** export (cioè anche la tabella `interventi`).

## Modello dati

Nuova colonna sulla tabella `rapportini`:

```sql
ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS territorio_override TEXT NULL;
```

`territorio_override` è la **fonte di verità** dell'override: contiene il **nome**
del territorio di destinazione (coerente con `mappa_piani.territorio`, che è un
nome). `NULL` = nessun override → vale il territorio del piano.

Si memorizza il nome (non l'id) perché:
- il Riepilogo raggruppa per nome territorio;
- il nome è stabile e leggibile; l'id si risolve al volo via `territories` quando
  serve aggiornare `interventi.territorio_id`.

La tabella `interventi` ha già `territorio_id UUID` (→ `territories.id`); è la
colonna su cui la board Live raggruppa.

## Componenti

### 1. Lettura — Riepilogo (`app/api/mappa/rapportini/riepilogo/route.ts`)

La `select` su `rapportini` aggiunge `territorio_override`. Il territorio esposto
per ogni riga diventa:

```
territorio = r.territorio_override ?? pianoInfoById[r.piano_id]?.territorio ?? null
```

Estratto in un helper puro testabile:

```ts
// utils/rapportini/territorioEffettivo.ts
export function territorioEffettivo(
  override: string | null | undefined,
  territorioPiano: string | null | undefined,
): string | null {
  const o = (override ?? '').trim();
  if (o) return o;
  const p = (territorioPiano ?? '').trim();
  return p || null;
}
```

Il raggruppamento esistente (`groupByDayTerritory`) sposta l'operatore nel gruppo
giusto senza altre modifiche. Lo stesso `piano_id` può comparire sotto due
territori (Ciarallo→Firenze, Pratesi→ACEA): `groupByDayTerritory` lo gestisce già
(cerca/crea il piano dentro ciascun territorio).

### 2. Scrittura — API spostamento

Nuova route `PATCH /api/mappa/rapportini/territorio` (admin), body:

```json
{ "rapportinoId": "uuid", "territorio": "ACEA" | null }
```

Passi:
1. Carica il rapportino (`id, piano_id, staff_id`). 404 se assente.
2. `territorio` non vuoto → risolve il nome in `territories.id`
   (case-insensitive su `name`). Se il territorio non esiste → 400.
   `territorio` null/vuoto → **ripristino**: usa il territorio del piano
   (`mappa_piani.territorio` → id) come destinazione per `interventi`.
3. `UPDATE rapportini SET territorio_override = <territorio|null> WHERE id = rapportinoId`.
4. `UPDATE interventi SET territorio_id = <idRisolto|idPiano>
   WHERE piano_id = rap.piano_id AND staff_id = rap.staff_id`.

Idempotente. Ritorna `{ ok: true }`.

La risoluzione nome→id e la scelta della destinazione sono estratte in un helper
puro (`risolviTerritorioDestinazione`) testabile senza I/O.

### 3. Robustezza alla rigenerazione (`lib/interventi/ensureInterventiForPiano.ts`)

Quando il piano viene risalvato, `ensureInterventiForPiano` ricrea gli interventi
col territorio del **piano**, perdendo l'override su Live (l'override su
`rapportini` invece sopravvive, quindi il Riepilogo resta corretto).

Per mantenere Live allineato, in coda a `ensureInterventiForPiano` si **ri-applicano**
gli override: per ogni `rapportini` del piano con `territorio_override` non nullo,
si rimette `interventi.territorio_id` al territorio override per quelle righe
(`piano_id` + `staff_id`). La logica di "quali update applicare" è una funzione
pura (`reapplyOverridesPlan`) testabile; l'`ensure` esegue gli update risultanti.

### 4. Selettore territori — GET

Oggi `app/api/admin/territori/route.ts` non ha GET. Aggiungo
`GET /api/mappa/territori` (admin) → `[{ id, name }]` ordinati per nome, solo
territori `active`. Alimenta il selettore "Sposta".

### 5. UI — Riepilogo (`components/modules/mappa/riepilogo/CardTerritorio.tsx`)

Nella riga operatore, nuova azione **"↪ Sposta"**:
- apre un piccolo selettore (lista territori dal GET) + voce **"Riporta al piano"**
  (ripristino → `territorio: null`);
- alla conferma chiama l'API e ricarica il riepilogo (`carica()` già esistente in
  `RiepilogoRapportini`, passato come callback).

Indicatore: gli operatori con `territorio_override` mostrano un badge discreto
(es. "↪ spostato") così l'admin sa quali sono e può annullare. Il flag
`territorio_override` viaggia nel payload del riepilogo fino alla riga.

`RiepilogoRapportini` carica una volta la lista territori (GET) e la passa a
`CardTerritorio`; gestisce lo stato del selettore aperto come già fa per
`confirmOp`.

## Flusso dati

```
[Admin clicca "Sposta" su Pratesi → sceglie ACEA]
      │
      ▼
PATCH /api/mappa/rapportini/territorio { rapportinoId, territorio:"ACEA" }
      │  1) rapportini.territorio_override = "ACEA"
      │  2) interventi.territorio_id = id(ACEA)  WHERE piano+staff
      ▼
[Riepilogo ricaricato] territorioEffettivo("ACEA", "Firenze") = "ACEA"
      → Pratesi sotto ACEA
[Live] interventi di Pratesi con territorio_id=ACEA → sotto ACEA
[Re-save piano] ensureInterventiForPiano ricrea interventi (Firenze)
      → in coda ri-applica override "ACEA" per Pratesi → resta coerente
```

## Gestione errori

- Rapportino inesistente → 404.
- Territorio destinazione inesistente/non attivo → 400 con messaggio.
- Errori Supabase su update → 500 con `error.message`.
- Ripristino con piano senza territorio risolvibile → `interventi.territorio_id`
  torna `null` (com'era prima dell'override), nessun errore.

## Testing

- `territorioEffettivo`: override valorizzato vince; vuoto/spazi → territorio
  piano; entrambi vuoti → null.
- `risolviTerritorioDestinazione`: nome→id case-insensitive; null/vuoto →
  destinazione = territorio piano; territorio non trovato → errore.
- `reapplyOverridesPlan`: dato un set di rapportini con/ senza override e una
  mappa nome→id, produce gli update corretti (solo per gli override risolvibili).
- API `territorio`: con fake db (pattern esistente) verifica che imposti
  `territorio_override` e aggiorni le righe `interventi` giuste; ripristino
  riporta al territorio del piano.

Baseline: lint/test del repo sono già parzialmente rossi (vedi memoria); il gate
è "nessun nuovo problema dai file di questo WP" (verifica mirata con
`npx eslint <file>` e `npx vitest run <file>`).

## Migrazione

Un'unica migrazione `supabase/migrations/<ts>_rapportini_territorio_override.sql`
con l'`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Da **lanciare manualmente**
dall'utente (il Supabase MCP non punta al DB prod). La SQL viene consegnata in
chat solo se richiesta esplicitamente.

## Fuori scope (YAGNI)

- Spostare interi piani (deciso: solo singolo operatore).
- Override "storico"/audit: si tiene solo lo stato corrente sulla colonna.
- Modifica del territorio negli export PDF del singolo rapportino (l'export
  legge le voci, non il territorio).
