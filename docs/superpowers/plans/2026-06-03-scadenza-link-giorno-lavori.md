# Scadenza link rapportini ancorata al giorno dei lavori — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far sì che la scadenza di un link rapportino parta dalle 00:00 (Europe/Rome) del giorno pianificato dei lavori (48h = 2 giorni di calendario), invece che dal momento di creazione, valendo anche per i link già esistenti.

**Architecture:** Si introduce un modulo puro `utils/rapportini/scadenza.ts` come unica fonte di verità della regola. `tokenStatus` smette di leggere `expires_at` e calcola lo stato dal campo `data` (il giorno lavori). La generazione popola `expires_at` con il valore coerente. Nessuna modifica al DB: lo stato è derivato al volo, quindi i link già emessi si adeguano da soli.

**Tech Stack:** TypeScript · Next.js 15 (route handlers) · Supabase · Vitest. Fuso orario gestito con `toLocaleString('sv-SE', { timeZone: 'Europe/Rome' })` (pattern già usato in tutto il progetto, nessuna libreria nuova).

**Spec di riferimento:** [docs/superpowers/specs/2026-06-03-scadenza-link-giorno-lavori-design.md](../specs/2026-06-03-scadenza-link-giorno-lavori-design.md)

---

## File Structure

| File | Responsabilità | Azione |
|---|---|---|
| `utils/rapportini/scadenza.ts` | Regola pura: data odierna Roma, somma giorni, mezzanotte Roma in ISO, scaduto sì/no, istante di scadenza. | Create |
| `utils/rapportini/scadenza.test.ts` | Test della regola pura (estate/inverno, bordi mezzanotte, DST). | Create |
| `utils/rapportini/tokenStatus.ts` | Mappa (`stato`, `data`) → `valido`/`scaduto`/`inviato`. Usa `scadenza.ts`. | Modify |
| `utils/rapportini/tokenStatus.test.ts` | Test di `tokenStatus` sulla nuova firma. | Modify (riscrittura) |
| `app/api/mappa/rapportini/riepilogo/route.ts` | Lista riepilogo: cast passato a `tokenStatus`. | Modify (1 riga) |
| `app/api/mappa/rapportini/genera/route.ts` | Generazione: popola `expires_at` coerente. | Modify (1 import + 1 riga) |

**Nota:** `app/api/mappa/rapportini/route.ts` e `app/api/r/[token]/route.ts` chiamano già `tokenStatus` con un oggetto che contiene `data` (il primo via tipo `list`, il secondo via `as any`); **non richiedono modifiche** ma vengono validati dal typecheck nel Task 3.

---

### Task 1: Modulo puro `scadenza.ts`

**Files:**
- Create: `utils/rapportini/scadenza.ts`
- Test: `utils/rapportini/scadenza.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Create `utils/rapportini/scadenza.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dataInRoma, addGiorni, mezzanotteRomaIso, isScaduto, scadenzaIso, GIORNI_VALIDITA } from './scadenza';

describe('GIORNI_VALIDITA', () => {
  it('è 2 (48h dalla mezzanotte)', () => { expect(GIORNI_VALIDITA).toBe(2); });
});

describe('dataInRoma', () => {
  it('estate: sera UTC resta stesso giorno se prima di mezzanotte Roma', () => {
    // 21:30Z = 23:30 Roma (UTC+2) dell'8
    expect(dataInRoma('2026-06-08T21:30:00Z')).toBe('2026-06-08');
  });
  it('estate: dopo le 22:00Z è già il giorno dopo a Roma', () => {
    // 22:30Z = 00:30 Roma del 9
    expect(dataInRoma('2026-06-08T22:30:00Z')).toBe('2026-06-09');
  });
  it('inverno: dopo le 23:00Z è già il giorno dopo a Roma', () => {
    // 23:30Z = 00:30 Roma (UTC+1) del 16
    expect(dataInRoma('2026-01-15T23:30:00Z')).toBe('2026-01-16');
  });
});

describe('addGiorni', () => {
  it('somma giorni semplici', () => { expect(addGiorni('2026-06-08', 1)).toBe('2026-06-09'); });
  it('somma due giorni', () => { expect(addGiorni('2026-06-08', 2)).toBe('2026-06-10'); });
  it('attraversa il cambio mese', () => { expect(addGiorni('2026-01-31', 1)).toBe('2026-02-01'); });
  it('attraversa il cambio anno', () => { expect(addGiorni('2026-12-31', 1)).toBe('2027-01-01'); });
  it('attraversa il weekend di ora legale (UTC, niente salti)', () => {
    expect(addGiorni('2026-03-28', 1)).toBe('2026-03-29');
  });
});

describe('mezzanotteRomaIso', () => {
  it('estate (+02:00)', () => { expect(mezzanotteRomaIso('2026-06-10')).toBe('2026-06-09T22:00:00.000Z'); });
  it('inverno (+01:00)', () => { expect(mezzanotteRomaIso('2026-01-17')).toBe('2026-01-16T23:00:00.000Z'); });
});

describe('isScaduto (giorno lavori = lunedì 2026-06-08)', () => {
  const data = '2026-06-08';
  it('il giorno stesso è valido', () => { expect(isScaduto(data, '2026-06-08T08:00:00Z')).toBe(false); });
  it('il giorno dopo è valido', () => { expect(isScaduto(data, '2026-06-09T08:00:00Z')).toBe(false); });
  it('due giorni dopo è scaduto', () => { expect(isScaduto(data, '2026-06-10T08:00:00Z')).toBe(true); });
  it('link generato in anticipo (venerdì prima) è valido', () => { expect(isScaduto(data, '2026-06-05T08:00:00Z')).toBe(false); });
  it('bordo: 23:30 Roma dell\'ultimo giorno valido → valido', () => { expect(isScaduto(data, '2026-06-09T21:30:00Z')).toBe(false); });
  it('bordo: 00:00 Roma del giorno dopo → scaduto', () => { expect(isScaduto(data, '2026-06-09T22:00:00Z')).toBe(true); });
});

describe('isScaduto inverno (giorno lavori = 2026-01-15)', () => {
  const data = '2026-01-15';
  it('bordo: 23:59 Roma dell\'ultimo giorno valido → valido', () => { expect(isScaduto(data, '2026-01-16T22:59:00Z')).toBe(false); });
  it('bordo: 00:00 Roma del giorno dopo → scaduto', () => { expect(isScaduto(data, '2026-01-16T23:00:00Z')).toBe(true); });
});

describe('scadenzaIso', () => {
  it('estate: mezzanotte Roma del giorno lavori + 48h', () => { expect(scadenzaIso('2026-06-08')).toBe('2026-06-09T22:00:00.000Z'); });
  it('inverno: mezzanotte Roma del giorno lavori + 48h', () => { expect(scadenzaIso('2026-01-15')).toBe('2026-01-16T23:00:00.000Z'); });
  it('è coerente con isScaduto (scaduto esattamente all\'istante restituito)', () => {
    const iso = scadenzaIso('2026-06-08');
    expect(isScaduto('2026-06-08', iso)).toBe(true);
    expect(isScaduto('2026-06-08', new Date(Date.parse(iso) - 1000).toISOString())).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `npx vitest run utils/rapportini/scadenza.test.ts`
Expected: FAIL — `Cannot find module './scadenza'` (il modulo non esiste ancora).

- [ ] **Step 3: Implementa il modulo**

Create `utils/rapportini/scadenza.ts`:

```ts
/** Giorni di calendario di validità dalla mezzanotte del giorno lavori (48h = 2). */
export const GIORNI_VALIDITA = 2;

/** Data (YYYY-MM-DD) in fuso Europe/Rome per un dato istante ISO. */
export function dataInRoma(nowIso: string): string {
  return new Date(nowIso).toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

/** Somma `n` giorni a una data YYYY-MM-DD (aritmetica in UTC → immune all'ora legale). */
export function addGiorni(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Istante ISO (UTC) della mezzanotte Europe/Rome di un dato YYYY-MM-DD. */
export function mezzanotteRomaIso(ymd: string): string {
  // Offset di Roma per quel giorno, misurato a mezzogiorno UTC (lontano dai bordi DST).
  const t = Date.parse(`${ymd}T12:00:00Z`);
  const wallRoma = new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Rome' });
  const wallUtc = new Date(t).toLocaleString('sv-SE', { timeZone: 'UTC' });
  const offsetMs = Date.parse(`${wallRoma.replace(' ', 'T')}Z`) - Date.parse(`${wallUtc.replace(' ', 'T')}Z`);
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - offsetMs).toISOString();
}

/** true se, all'istante `nowIso`, il link per il giorno lavori `data` è scaduto. */
export function isScaduto(data: string, nowIso: string): boolean {
  const ultimoValido = addGiorni(data, GIORNI_VALIDITA - 1); // data + 1
  return dataInRoma(nowIso) > ultimoValido;                  // confronto lessicografico YYYY-MM-DD
}

/** Istante ISO di scadenza (00:00 Europe/Rome del giorno lavori + 48h) per `expires_at`. */
export function scadenzaIso(data: string): string {
  return mezzanotteRomaIso(addGiorni(data, GIORNI_VALIDITA)); // mezzanotte di data + 2
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `npx vitest run utils/rapportini/scadenza.test.ts`
Expected: PASS (tutti i casi verdi).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/scadenza.ts utils/rapportini/scadenza.test.ts
git commit -m "feat(rapportini): modulo scadenza link ancorata al giorno lavori" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `tokenStatus` calcola dallo `data` invece di `expires_at`

**Files:**
- Modify: `utils/rapportini/tokenStatus.ts`
- Test: `utils/rapportini/tokenStatus.test.ts` (riscrittura)

- [ ] **Step 1: Riscrivi il test sulla nuova firma (fallirà)**

Replace tutto il contenuto di `utils/rapportini/tokenStatus.test.ts` con:

```ts
import { describe, it, expect } from 'vitest';
import { tokenStatus } from './tokenStatus';

// Giorno lavori = lunedì 2026-06-08; "adesso" variabile.
describe('tokenStatus', () => {
  it('inviato vince anche se la data è passata', () => {
    expect(tokenStatus({ stato: 'inviato', data: '2026-01-01' }, '2026-06-10T08:00:00Z')).toBe('inviato');
  });
  it('valido il giorno dei lavori', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-06-08' }, '2026-06-08T08:00:00Z')).toBe('valido');
  });
  it('valido il giorno dopo', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-06-08' }, '2026-06-09T08:00:00Z')).toBe('valido');
  });
  it('scaduto due giorni dopo', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-06-08' }, '2026-06-10T08:00:00Z')).toBe('scaduto');
  });
  it('valido se generato in anticipo (la data dei lavori è futura)', () => {
    expect(tokenStatus({ stato: 'in_corso', data: '2026-06-08' }, '2026-06-05T08:00:00Z')).toBe('valido');
  });
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `npx vitest run utils/rapportini/tokenStatus.test.ts`
Expected: FAIL — la vecchia implementazione legge `expires_at` (qui `undefined`), quindi i casi "scaduto" risultano "valido".

- [ ] **Step 3: Aggiorna l'implementazione**

Replace tutto il contenuto di `utils/rapportini/tokenStatus.ts` con:

```ts
import { isScaduto } from './scadenza';

export type RapportinoStato = 'in_corso' | 'inviato' | 'scaduto';

export function tokenStatus(
  r: { stato: RapportinoStato; data: string },
  nowIso: string,
): 'valido' | 'scaduto' | 'inviato' {
  if (r.stato === 'inviato') return 'inviato';
  return isScaduto(r.data, nowIso) ? 'scaduto' : 'valido';
}
```

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `npx vitest run utils/rapportini/tokenStatus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/tokenStatus.ts utils/rapportini/tokenStatus.test.ts
git commit -m "refactor(rapportini): tokenStatus calcola lo stato dal giorno lavori" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Allinea i chiamanti di `tokenStatus`

**Files:**
- Modify: `app/api/mappa/rapportini/riepilogo/route.ts:47`
- Verify (nessuna modifica attesa): `app/api/mappa/rapportini/route.ts`, `app/api/r/[token]/route.ts`

- [ ] **Step 1: Aggiorna il cast nel riepilogo**

In `app/api/mappa/rapportini/riepilogo/route.ts`, alla riga ~47, cambia il tipo castato da `expires_at` a `data`.

Da:

```ts
    statoCalcolato: tokenStatus(r as { stato: 'in_corso' | 'inviato' | 'scaduto'; expires_at: string }, nowIso),
```

A:

```ts
    statoCalcolato: tokenStatus(r as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string }, nowIso),
```

(`data` è già nel `select` alla riga 18, quindi il valore è presente a runtime.)

- [ ] **Step 2: Typecheck dell'intero progetto**

Run: `npx tsc --noEmit`
Expected: PASS (nessun errore). Questo conferma che `app/api/mappa/rapportini/route.ts` (passa l'oggetto `r` del tipo `list`, che include `data`) e `app/api/r/[token]/route.ts` (passa `rap as any`) restano compatibili con la nuova firma senza modifiche.

- [ ] **Step 3: Commit**

```bash
git add app/api/mappa/rapportini/riepilogo/route.ts
git commit -m "refactor(rapportini): allinea riepilogo alla nuova firma di tokenStatus" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `genera` salva `expires_at` coerente al giorno lavori

**Files:**
- Modify: `app/api/mappa/rapportini/genera/route.ts`

- [ ] **Step 1: Importa `scadenzaIso`**

In testa a `app/api/mappa/rapportini/genera/route.ts`, accanto agli altri import da `@/utils/rapportini/...`, aggiungi:

```ts
import { scadenzaIso } from '@/utils/rapportini/scadenza';
```

- [ ] **Step 2: Calcola la scadenza dal giorno del piano**

Alla riga 39, sostituisci il calcolo basato su `Date.now()`.

Da:

```ts
    const expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
```

A:

```ts
    const expires = scadenzaIso(piano.data);
```

(`piano.data` proviene dal `select('id, data')` alla riga 17. Le righe 50 e 56 che usano `expires_at: expires` restano invariate; ora rigenerare è idempotente.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (nessun errore).

- [ ] **Step 4: Commit**

```bash
git add app/api/mappa/rapportini/genera/route.ts
git commit -m "feat(rapportini): genera popola expires_at dal giorno lavori (48h dalla mezzanotte)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Verifica finale completa

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Tutti i test**

Run: `npm test`
Expected: PASS (inclusi `scadenza.test.ts` e `tokenStatus.test.ts`; nessuna regressione negli altri).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: nessun nuovo errore introdotto dai file toccati.

- [ ] **Step 4: Verifica manuale (facoltativa, runtime con app + Supabase)**

1. Genera i rapportini per un piano con `data` **futura** → nel Riepilogo il badge resta "In corso".
2. Apri un piano **già esistente** con `data` di oggi/ieri → lo stato mostrato riflette subito la nuova regola, **senza rigenerare**.
3. Un piano con `data` di **3+ giorni fa** → badge "Scaduto".

---

## Self-Review

**Spec coverage:**
- Regola 48h dalla mezzanotte del giorno lavori → Task 1 (`isScaduto`, `scadenzaIso`, `GIORNI_VALIDITA`).
- Calcolo al volo / vale per link esistenti → Task 2 (`tokenStatus` usa `data`, non `expires_at`).
- `expires_at` popolata coerente alla generazione → Task 4.
- Fuso Europe/Rome → Task 1 (`dataInRoma`, `mezzanotteRomaIso`), test estate+inverno.
- Chiamanti adeguati → Task 3 (riepilogo) + typecheck per gli altri due.
- Nessuna SQL/migrazione → confermato (nessun file in `supabase/`).
- Testing (estate/inverno, bordi mezzanotte, DST) → Task 1 e Task 2.

**Placeholder scan:** nessun TBD/TODO; ogni step di codice contiene il codice completo.

**Type consistency:** la firma `tokenStatus(r: { stato: RapportinoStato; data: string }, nowIso)` definita in Task 2 è usata coerentemente nel cast del Task 3. Le funzioni di `scadenza.ts` (`dataInRoma`, `addGiorni`, `mezzanotteRomaIso`, `isScaduto`, `scadenzaIso`, `GIORNI_VALIDITA`) hanno gli stessi nomi tra Task 1 (definizione + test) e Task 2/Task 4 (uso).
