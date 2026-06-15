# Centro di costo per-operatore + conteggio appuntamenti nell'header (2 fix)

**Data:** 2026-06-15
**Stato:** Spec approvata in brainstorming, da rivedere prima del piano

Due fix indipendenti, sviluppati insieme perché toccano la stessa area (cronoprogramma / assegnazioni).

---

## FIX 1 — Conteggio appuntamenti nell'intestazione del giorno (vista Calendario)

### Problema
Dopo lo spostamento degli appuntamenti nel modulo dedicato, nel cronoprogramma è rimasta la striscia `AppointmentCountStrip` che ripete la data già mostrata dal calendario → "data doppia".

### Decisione
- **Rimuovere** la striscia `AppointmentCountStrip` dal cronoprogramma (e cancellare il componente, non più usato).
- Nel **`DayCell` della vista Calendario** (`CronoCalendarView.tsx`), nell'header del giorno, **tra il pulsante "A-Z" e il pulsante "Nuovo"**, mostrare un testo compatto **`N App.`** (es. `3 App.`) in colore **celeste** (`var(--brand-primary)`), stessa altezza/font dell'header, visibile solo se il conteggio > 0.

### Implementazione
- `CronoprogrammaWorkspace.tsx`: rimuovere import + render di `AppointmentCountStrip`. MANTENERE lo stato `appointments` e il fetch. Calcolare un `appointmentCountByIso: Record<string, number>` (riuso `countAppointmentsByDay(appointments, daysArray.map(fmtDay))` da `lib/appuntamenti.ts`) e passarlo a `<CronoCalendarView appointmentCountByIso={...} />`.
- `CronoCalendarView.tsx`: nuova prop opzionale `appointmentCountByIso?: Record<string, number>`; propagarla a `DayCell`.
- `DayCell`: nell'header, dopo il bottone "A-Z" (e prima del gruppo a destra col bottone "Nuovo"), aggiungere:
  ```tsx
  {(() => {
    const n = props.appointmentCountByIso?.[iso] ?? 0;
    if (n <= 0) return null;
    return (
      <span className="text-[10px] font-semibold" style={{ color: 'var(--brand-primary)' }} title={`${n} appuntamenti`}>
        {n} App.
      </span>
    );
  })()}
  ```
  (collocazione esatta da rifinire mantenendo l'allineamento: deve stare visivamente tra "A-Z" e "Nuovo".)
- Cancellare `components/modules/cronoprogramma-personale/AppointmentCountStrip.tsx`. L'helper `lib/appuntamenti.ts` resta (riusato per i conteggi).

### Fuori scope
- Conteggio nelle viste griglia/split/tabella (solo Calendario, è quella usata).

---

## FIX 2 — Centro di costo per-operatore (default fisso + override a periodo)

### Problema
Oggi `cost_center` è un campo **dell'assegnazione** chiesto **ogni volta** nei dialoghi (`NewAssignmentDialog`/`EditAssignmentDialog`), required. Al 90-98% l'operatore ha sempre lo stesso centro di costo. Va spostato sull'operatore (Impostazioni → Personale), con la possibilità di override per un periodo definito.

### Valori centro di costo (invariati)
`constants/cost-centers.ts` → `CostCenter`: ALESSANDRINI, PASTORELLI, PASSACANTILLI, PLENZICH, FIRENZE MANUTENZIONI, MULTISERVIZI.

### Modello dati
1. **`staff.cost_center text NULL`** — il centro di costo **predefinito** dell'operatore ("sempre quello"). Opzionale.
2. **Nuova tabella `staff_cost_center_ranges`** — override a periodo:
   ```sql
   CREATE TABLE IF NOT EXISTS staff_cost_center_ranges (
     id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
     staff_id    text NOT NULL,
     cost_center text NOT NULL,
     valid_from  date NOT NULL,
     valid_to    date NULL,            -- NULL = a tempo indeterminato da valid_from
     created_at  timestamptz DEFAULT now(),
     updated_at  timestamptz DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS idx_staff_cc_ranges_staff ON staff_cost_center_ranges (staff_id);
   ALTER TABLE staff_cost_center_ranges ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "auth_policy" ON staff_cost_center_ranges FOR ALL TO authenticated USING (true) WITH CHECK (true);
   ```
   E la colonna: `ALTER TABLE staff ADD COLUMN IF NOT EXISTS cost_center text NULL;`

### Risoluzione (helper puro testato)
`lib/costCenter.ts`:
```ts
export type CostCenterRange = { cost_center: string; valid_from: string; valid_to: string | null };
/** Centro di costo attivo per una data: override di periodo se copre la data, altrimenti il default. */
export function resolveCostCenter(
  defaultCostCenter: string | null,
  ranges: CostCenterRange[],
  isoDate: string
): string | null
```
Regole: un range copre `isoDate` se `valid_from <= isoDate && (valid_to == null || isoDate <= valid_to)`. Se più range coprono la data, vince quello con `valid_from` più recente (poi `valid_to` più recente come spareggio). Se nessun range copre → `defaultCostCenter`. Test su: nessun range→default; range che copre→override; range fuori→default; `valid_to` null (aperto); più range sovrapposti→il più recente; default null + nessun range→null.

### Impostazioni → Personale (UI)
- `app/impostazioni/personale/NewOperatorModal.tsx` (create) e `PersonaleClient.tsx` (edit): aggiungere
  - Select **"Centro di costo"** (predefinito; opzionale; valori `COST_CENTERS`).
  - Sezione **"Centri di costo a periodo"**: lista di righe `{cost_center, valid_from (Dal), valid_to (Al, opzionale)}` con aggiungi/rimuovi.
- API `app/api/admin/personale/route.ts` (POST + PATCH): accettare `costCenter` (→ `staff.cost_center`) e `costCenterRanges` (array). Salvataggio ranges: strategia **replace** (delete dei range dell'operatore + reinsert della lista inviata) dentro l'update, così la UI manda sempre lo stato completo.

### Dialoghi assegnazione
- `NewAssignmentDialog.tsx` / `EditAssignmentDialog.tsx`: **rimuovere** il campo Centro di costo (select + stato + validazione `!!costCenter`). Il salvataggio NON invia più `cost_center`.
- Il `cost_center` viene **risolto e salvato lato server** nel write path delle assegnazioni (`app/api/assignments/create/route.ts` e `.../update/route.ts`): dato `staff_id` + la **data** dell'assegnazione (da `calendar_days.day` via `day_id`), caricare `staff.cost_center` + `staff_cost_center_ranges` dell'operatore e calcolare `resolveCostCenter(...)`, poi scrivere il risultato in `assignments.cost_center`.
  - **VERIFICA nel piano:** confermare che i dialoghi scrivono tramite queste route API. Se invece inseriscono/aggiornano direttamente via `supabaseBrowser`, due opzioni: (a) farli passare per le route API, oppure (b) risolvere client-side caricando i dati cdc dell'operatore. Preferenza: server-side via API (centralizza la logica). Decisione finale nel piano dopo lettura del write path reale.
- Se la risoluzione dà `null` (operatore senza default né range per quella data): salvare `cost_center = null` (non blocca più la creazione — oggi era required; ora è derivato).

### A valle (invariato)
Export Excel (`app/api/export/assignments/route.ts`), `CronoTableView`, filtri `CC:` (`utils.ts`), Mappa: leggono `assignments.cost_center` come oggi. Nessuna modifica (lo storage resta).

### Seed (SQL una tantum, consegnata all'utente)
Imposta il predefinito di ogni operatore col cdc più frequente nelle sue assegnazioni storiche:
```sql
UPDATE staff s
SET cost_center = sub.cc
FROM (
  SELECT staff_id, cost_center AS cc
  FROM (
    SELECT staff_id, cost_center,
           row_number() OVER (PARTITION BY staff_id ORDER BY count(*) DESC) AS rn
    FROM assignments
    WHERE cost_center IS NOT NULL
    GROUP BY staff_id, cost_center
  ) ranked
  WHERE rn = 1
) sub
WHERE s.id = sub.staff_id::text AND s.cost_center IS NULL;
```
(Da verificare il tipo di `assignments.staff_id` vs `staff.id` prima del lancio; il cast `::text` si adatta alla convenzione del progetto.)

### Error handling
- API personale: `costCenter` deve essere uno dei valori validi o null; ogni range deve avere `cost_center` valido + `valid_from`; se `valid_to` presente, `valid_from <= valid_to` (altrimenti 400).
- Risoluzione: pura, nessun errore (ritorna null se non risolvibile).

### Testing
- `lib/costCenter.test.ts` (vitest): i casi di `resolveCostCenter` elencati sopra.
- Smoke manuale (dopo migration + deploy): impostare default e un override su un operatore; creare un'assegnazione nel periodo override → cdc = override; fuori → default; verificare in tabella/export.

---

## File toccati (sintesi)

**Fix 1:**
- Modificati: `CronoprogrammaWorkspace.tsx`, `CronoCalendarView.tsx`.
- Rimosso: `components/modules/cronoprogramma-personale/AppointmentCountStrip.tsx`.

**Fix 2:**
- Nuovi: `supabase/migrations/<ts>_staff_cost_center.sql`, `lib/costCenter.ts`, `lib/costCenter.test.ts`, `docs/superpowers/sql/2026-06-15-seed-cost-center.sql` (consegna manuale).
- Modificati: `app/impostazioni/personale/NewOperatorModal.tsx`, `app/impostazioni/personale/PersonaleClient.tsx`, `app/api/admin/personale/route.ts`, `components/NewAssignmentDialog.tsx`, `components/EditAssignmentDialog.tsx`, `app/api/assignments/create/route.ts`, `app/api/assignments/update/route.ts`, `types.ts` (campo `cost_center` su Staff).

## Out of scope (follow-up)
- Override per-singola-assegnazione (eccezione una tantum non a periodo): si gestisce con un range breve.
- Ricalcolo retroattivo dei cdc sullo storico (lo storage resta congelato).
