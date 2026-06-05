# Coordinate committente nel rapportino — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leggere le coordinate GPS fornite dai committenti (due colonne `Lat`/`Long`) all'import, esporle come campo template COORDINATE e renderle cliccabili (apri Maps sul punto esatto) nel rapportino, lasciando indirizzo/routing invariati.

**Architecture:** Le coordinate sono un dato **separato** che viaggia nel `raw_json` della voce (nessuna migration). `parseExcelToTasks` riconosce `Lat`/`Long` dall'intestazione e popola `task.coordinate` (stringa `"lat, lng"`, virgola→punto), **senza** toccare `task.lat/lng` (che restano per il geocoding indirizzo). Il valore fluisce mappa → `mappa_piani_operatori.tasks` (salvato verbatim) → `raw_json` voce. Le viste estraggono `coordinate` dal `raw_json` e la mostrano come link Google Maps. `COORDINATE` è il 12° campo info, attivabile dal template.

**Tech Stack:** TypeScript, Next.js 15 (App Router, RSC), Supabase, ExcelJS (export), xlsx/sheetjs (import), Vitest (test puri). Nessuna nuova dipendenza.

**Spec:** [docs/superpowers/specs/2026-06-05-coordinate-committente-rapportino-design.md](../specs/2026-06-05-coordinate-committente-rapportino-design.md)

**Branch:** `feat/coordinate-committente-rapportino` (già creato da `main`).

---

## File Structure

| File | Azione | Responsabilità |
|------|--------|----------------|
| `utils/routing/parseCoordinate.ts` | Crea | `parseLatLng(lat, lng)` puro: normalizza virgola→punto, valida, formatta `"lat, lng"` |
| `utils/routing/parseCoordinate.test.ts` | Crea | Test del parser |
| `utils/routing/types.ts` | Modifica | `Task.coordinate?: string` |
| `utils/routing/excelParser.ts` | Modifica | `ColMap` + `detectFormat` rilevano `lat`/`lng`; `parseExcelToTasks` popola `task.coordinate` |
| `utils/routing/excelParser.test.ts` | Crea | Test `detectFormat` rileva colonne lat/long |
| `utils/rapportini/infoCampi.ts` | Modifica | `InfoChiave += 'coordinate'`; `INFO_CAMPI_DISPONIBILI`; helper `coordinateFromRaw` |
| `utils/rapportini/infoCampi.test.ts` | Crea | Test `coordinateFromRaw` + `valoreInfo('coordinate')` |
| `utils/rapportini/mapsLink.ts` | Crea | `mapsUrlFromCoordinate`, `mapsUrlFromAddress` |
| `utils/rapportini/mapsLink.test.ts` | Crea | Test URL Maps |
| `app/r/[token]/page.tsx` | Modifica | Inietta `coordinate` da `raw_json` nelle voci |
| `components/modules/rapportini/RapportinoForm.tsx` | Modifica | `Voce.coordinate?: string` |
| `components/modules/rapportini/VoceFocus.tsx` | Modifica | Indirizzo link Maps + link "Punto esatto" |
| `app/hub/rapportini/contenuto/[id]/page.tsx` | Modifica | `raw_json` nel select + colonna COORDINATE cliccabile |
| `lib/rapportini/exportStandard.ts` | Modifica | Colonna COORDINATE come hyperlink Excel |

**NON toccare:** `utils/rapportini/buildVoci.ts` (NON aggiungere `coordinate` a `VoceSnapshot`/`Voce`: verrebbe spread nell'insert di `rapportino_voci` su una colonna inesistente → errore DB. La coordinata vive **solo** nel `raw_json`). Logica geocoding/mappa/routing, `app/api/interventi/import/route.ts`, `app/api/mappa/rapportini/genera/route.ts` (il `raw_json` porta già `coordinate`), `TemplateRapportiniClient.tsx` (legge `INFO_CAMPI_DISPONIBILI`).

---

## Task 1: `parseLatLng` — parser puro coordinate

**Files:**
- Create: `utils/routing/parseCoordinate.ts`
- Test: `utils/routing/parseCoordinate.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// utils/routing/parseCoordinate.test.ts
import { describe, it, expect } from 'vitest';
import { parseLatLng } from './parseCoordinate';

describe('parseLatLng', () => {
  it('due colonne numeriche → "lat, lng" col punto (pulisce il rumore float)', () => {
    expect(parseLatLng(41.853674999999996, 12.7888783)).toBe('41.853675, 12.7888783');
  });
  it('virgola decimale all\'italiana → punto', () => {
    expect(parseLatLng('41,853674', '12,788878')).toBe('41.853674, 12.788878');
  });
  it('stringhe già col punto → invariate', () => {
    expect(parseLatLng('41.853674', '12.788878')).toBe('41.853674, 12.788878');
  });
  it('longitudine negativa valida', () => {
    expect(parseLatLng(45, -120)).toBe('45, -120');
  });
  it('0,0 → null', () => { expect(parseLatLng(0, 0)).toBeNull(); });
  it('cella vuota → null', () => { expect(parseLatLng('', '12.7')).toBeNull(); });
  it('testo non numerico → null', () => { expect(parseLatLng('N/A', 'x')).toBeNull(); });
  it('lat fuori range → null', () => { expect(parseLatLng(91, 12)).toBeNull(); });
  it('lng fuori range → null', () => { expect(parseLatLng(41, 181)).toBeNull(); });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `npx vitest run utils/routing/parseCoordinate.test.ts`
Expected: FAIL — `Failed to resolve import "./parseCoordinate"` / `parseLatLng is not a function`.

- [ ] **Step 3: Implementa il parser**

```ts
// utils/routing/parseCoordinate.ts

/** Cella (numero o stringa con virgola/punto decimale) → numero finito, o null. */
function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim().replace(',', '.');
    if (s === '') return null;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Arrotonda a 7 decimali (~1cm) e rimuove il rumore float. */
function fmt(n: number): string {
  return String(Math.round(n * 1e7) / 1e7);
}

/**
 * Coordinata committente da DUE colonne (lat, lng).
 * Accetta numeri o stringhe con virgola decimale all'italiana.
 * Ritorna "lat, lng" (sempre col PUNTO) oppure null se non valida.
 */
export function parseLatLng(lat: unknown, lng: unknown): string | null {
  const la = toNum(lat);
  const ln = toNum(lng);
  if (la == null || ln == null) return null;
  if (la === 0 && ln === 0) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return `${fmt(la)}, ${fmt(ln)}`;
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `npx vitest run utils/routing/parseCoordinate.test.ts`
Expected: PASS (9 test verdi).

- [ ] **Step 5: Commit**

```bash
git add utils/routing/parseCoordinate.ts utils/routing/parseCoordinate.test.ts
git commit -m "feat(routing): parseLatLng — coordinate committente da due colonne (virgola->punto)"
```

---

## Task 2: Cattura coordinate nell'import Excel

**Files:**
- Modify: `utils/routing/types.ts` (Task)
- Modify: `utils/routing/excelParser.ts` (ColMap, detectFormat, parseExcelToTasks)
- Test: `utils/routing/excelParser.test.ts` (create)

- [ ] **Step 1: Aggiungi `coordinate` al tipo `Task`**

In `utils/routing/types.ts`, dentro `interface Task`, dopo `lng?: number;` (riga 12) aggiungi:

```ts
  /** Coordinata committente "lat, lng" letta dal file (separata da lat/lng del geocoding). */
  coordinate?: string;
```

- [ ] **Step 2: Scrivi il test che fallisce (rilevamento colonne)**

```ts
// utils/routing/excelParser.test.ts
import { describe, it, expect } from 'vitest';
import { detectFormat } from './excelParser';

describe('detectFormat — colonne coordinate', () => {
  it('rileva Lat/Long dall\'intestazione (formato leggibile)', () => {
    const header = ['Indirizzo', 'CAP', 'Comune', 'Long', 'Lat'];
    const cm = detectFormat(header);
    expect(cm).not.toBeNull();
    expect(cm!.lat).toBe(4);
    expect(cm!.lng).toBe(3);
  });
  it('senza colonne coordinate → lat/lng null', () => {
    const header = ['Indirizzo', 'CAP', 'Comune'];
    const cm = detectFormat(header);
    expect(cm).not.toBeNull();
    expect(cm!.lat).toBeNull();
    expect(cm!.lng).toBeNull();
  });
});
```

- [ ] **Step 3: Esegui il test e verifica che fallisce**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: FAIL — `cm!.lat` è `undefined` (proprietà non esiste su `ColMap`).

- [ ] **Step 4: Aggiungi `lat`/`lng` a `ColMap`**

In `utils/routing/excelParser.ts`, dentro `type ColMap` (righe 55-71), dopo `durata: number | null;` aggiungi:

```ts
  lat: number | null;
  lng: number | null;
```

- [ ] **Step 5: Calcola lat/lng in `detectFormat` e includile in TUTTI i return**

In `detectFormat`, subito dopo le righe che calcolano `odl` e `odsin` (riga 77), aggiungi:

```ts
  const lat = findCol(headers, [/^lat(itudine)?$/]);
  const lng = findCol(headers, [/^long(itudine)?$/, /^lon$/, /^lng$/]);
```

Poi aggiungi `lat,` e `lng,` a **ciascuno dei 4 oggetti `return`** di `detectFormat` (ATTGIORN, Massiva-con-header, Massiva-fallback, Export Dati/Geocall), accanto a `durata`. Esempio sul ramo Export Dati (ultimo return, righe ~147-163):

```ts
  return {
    via,
    cap: findCol(headers, [/^cap$/, /^c\.a\.p\.?$/]),
    comune: findCol(headers, [/^comune$/, /^citt[aà]$/, /^localit/]),
    pdR: findCol(headers, [/^pdr/, /^pdr\s*\//, /^punto.di.rec/]),
    odl,
    odsin,
    fascia: findCol(headers, [/^fascia/, /^slot/, /^orario/]),
    operatore: findCol(headers, [/^operatore$/, /^risorsa$/, /^tecnico$/, /^esecutore$/, /^addetto$/, /^nome (operatore|tecnico|risorsa)$/]),
    nominativo: findCol(headers, [/^nominativo$/, /^nominativo cliente$/, /^cliente$/]),
    matricola: findCol(headers, [/^matricola$/, /matricola/]),
    recapito: null,
    accessibilita: null,
    attivita: findCol(headers, [/^attivit/, /^tipo.*(odl|servizio|intervento)/, /^servizio$/, /^tipo$/]),
    codice: null,
    durata: findCol(headers, [/tempo.*esec/, /^durata$/, /^tempo$/, /minut/]),
    lat,
    lng,
  };
```

> Aggiungi le stesse due righe `lat,` `lng,` agli altri 3 return. TypeScript fallirà finché tutti e 4 non le includono (è la rete di sicurezza).

- [ ] **Step 6: Esegui il test e verifica che passa**

Run: `npx vitest run utils/routing/excelParser.test.ts`
Expected: PASS (2 test verdi).

- [ ] **Step 7: Popola `task.coordinate` in `parseExcelToTasks`**

In cima al file aggiungi l'import:

```ts
import { parseLatLng } from './parseCoordinate';
```

In `parseExcelToTasks`, dentro l'oggetto `task` (righe 265-281), dopo `durata_min: colMap.durata != null ? ... : undefined,` aggiungi:

```ts
      coordinate:
        colMap.lat != null && colMap.lng != null
          ? (parseLatLng(row[colMap.lat], row[colMap.lng]) ?? undefined)
          : undefined,
```

- [ ] **Step 8: Verifica tipi**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 9: Commit**

```bash
git add utils/routing/types.ts utils/routing/excelParser.ts utils/routing/excelParser.test.ts
git commit -m "feat(routing): leggi coordinate Lat/Long dall'import in task.coordinate"
```

---

## Task 3: Campo info `coordinate` + helper `coordinateFromRaw`

**Files:**
- Modify: `utils/rapportini/infoCampi.ts`
- Test: `utils/rapportini/infoCampi.test.ts` (create)

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// utils/rapportini/infoCampi.test.ts
import { describe, it, expect } from 'vitest';
import { coordinateFromRaw, valoreInfo, INFO_CAMPI_DISPONIBILI } from './infoCampi';

describe('coordinateFromRaw', () => {
  it('estrae la coordinata dal raw_json', () => {
    expect(coordinateFromRaw({ coordinate: '41.853675, 12.7888783' })).toBe('41.853675, 12.7888783');
  });
  it('assente/vuota/non-stringa → undefined', () => {
    expect(coordinateFromRaw({})).toBeUndefined();
    expect(coordinateFromRaw({ coordinate: '' })).toBeUndefined();
    expect(coordinateFromRaw(null)).toBeUndefined();
    expect(coordinateFromRaw({ coordinate: 123 })).toBeUndefined();
  });
});

describe('campo coordinate', () => {
  it('coordinate è tra i campi info disponibili', () => {
    expect(INFO_CAMPI_DISPONIBILI.some((c) => c.chiave === 'coordinate')).toBe(true);
  });
  it('valoreInfo legge coordinate dalla voce', () => {
    expect(valoreInfo({ coordinate: '41.85, 12.78' }, 'coordinate')).toBe('41.85, 12.78');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `npx vitest run utils/rapportini/infoCampi.test.ts`
Expected: FAIL — `coordinateFromRaw` non esportata; `'coordinate'` non assegnabile a `InfoChiave`.

- [ ] **Step 3: Aggiungi `'coordinate'` a `InfoChiave` e a `INFO_CAMPI_DISPONIBILI`**

In `utils/rapportini/infoCampi.ts`:

Riga 1-3, estendi il tipo:

```ts
export type InfoChiave =
  | 'nominativo' | 'matricola' | 'pdr' | 'odl' | 'via'
  | 'comune' | 'cap' | 'recapito' | 'attivita' | 'accessibilita' | 'fascia_oraria'
  | 'coordinate';
```

In `INFO_CAMPI_DISPONIBILI`, dopo la riga di `fascia_oraria` (riga 23) aggiungi:

```ts
  { chiave: 'coordinate', etichettaDefault: 'COORDINATE' },
```

- [ ] **Step 4: Aggiungi l'helper `coordinateFromRaw`**

In fondo a `utils/rapportini/infoCampi.ts` aggiungi:

```ts
/** Estrae la coordinata committente ("lat, lng") dal raw_json di una voce, o undefined. */
export function coordinateFromRaw(raw: unknown): string | undefined {
  const c = (raw as { coordinate?: unknown } | null | undefined)?.coordinate;
  return typeof c === 'string' && c.trim() !== '' ? c : undefined;
}
```

- [ ] **Step 5: Esegui il test e verifica che passa**

Run: `npx vitest run utils/rapportini/infoCampi.test.ts`
Expected: PASS (4 test verdi).

- [ ] **Step 6: Commit**

```bash
git add utils/rapportini/infoCampi.ts utils/rapportini/infoCampi.test.ts
git commit -m "feat(rapportini): campo info COORDINATE + helper coordinateFromRaw"
```

---

## Task 4: Util link Maps

**Files:**
- Create: `utils/rapportini/mapsLink.ts`
- Test: `utils/rapportini/mapsLink.test.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// utils/rapportini/mapsLink.test.ts
import { describe, it, expect } from 'vitest';
import { mapsUrlFromCoordinate, mapsUrlFromAddress } from './mapsLink';

describe('mapsUrlFromCoordinate', () => {
  it('punto esatto: rimuove spazi e codifica la virgola', () => {
    expect(mapsUrlFromCoordinate('41.853675, 12.7888783'))
      .toBe('https://www.google.com/maps/search/?api=1&query=41.853675%2C12.7888783');
  });
});

describe('mapsUrlFromAddress', () => {
  it('compone via + cap + comune e codifica', () => {
    expect(mapsUrlFromAddress('Via Cancellata Grande 18', 'Zagarolo', '00039'))
      .toBe('https://www.google.com/maps/search/?api=1&query=Via%20Cancellata%20Grande%2018%2000039%20Zagarolo');
  });
  it('ignora i pezzi mancanti', () => {
    expect(mapsUrlFromAddress('Via Roma 1', null, undefined))
      .toBe('https://www.google.com/maps/search/?api=1&query=Via%20Roma%201');
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run: `npx vitest run utils/rapportini/mapsLink.test.ts`
Expected: FAIL — `Failed to resolve import "./mapsLink"`.

- [ ] **Step 3: Implementa il modulo**

```ts
// utils/rapportini/mapsLink.ts

const BASE = 'https://www.google.com/maps/search/?api=1&query=';

/** URL Google Maps verso il punto esatto. `coord` è già "lat, lng" normalizzata. */
export function mapsUrlFromCoordinate(coord: string): string {
  return BASE + encodeURIComponent(coord.replace(/\s+/g, ''));
}

/** URL Google Maps di ricerca per indirizzo (via, comune, cap). */
export function mapsUrlFromAddress(
  via?: string | null,
  comune?: string | null,
  cap?: string | null,
): string {
  const q = [via, cap, comune].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
  return BASE + encodeURIComponent(q);
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run: `npx vitest run utils/rapportini/mapsLink.test.ts`
Expected: PASS (3 test verdi).

- [ ] **Step 5: Commit**

```bash
git add utils/rapportini/mapsLink.ts utils/rapportini/mapsLink.test.ts
git commit -m "feat(rapportini): util link Google Maps (coordinata + indirizzo)"
```

---

## Task 5: Vista operatore — indirizzo + coordinata cliccabili

**Files:**
- Modify: `app/r/[token]/page.tsx`
- Modify: `components/modules/rapportini/RapportinoForm.tsx`
- Modify: `components/modules/rapportini/VoceFocus.tsx`

> Nessun unit test: i componenti React non hanno infrastruttura di test nel repo (nessuna RTL, no nuove dipendenze). Verifica con `tsc` + test manuale (Task 8).

- [ ] **Step 1: `RapportinoForm` — aggiungi `coordinate` al tipo `Voce`**

In `components/modules/rapportini/RapportinoForm.tsx`, dentro `export type Voce` (righe 13-29), dopo `fascia_oraria?: string;` aggiungi:

```ts
  coordinate?: string;
```

- [ ] **Step 2: `page.tsx` — inietta `coordinate` dal `raw_json`**

In `app/r/[token]/page.tsx`:

Aggiungi l'import (dopo riga 4):

```ts
import { coordinateFromRaw } from '@/utils/rapportini/infoCampi';
```

Nel `.map` che costruisce `voci` (righe 116-132), prima della riga `nuovo: Boolean(...)` aggiungi:

```ts
    coordinate: coordinateFromRaw(v.raw_json),
```

- [ ] **Step 3: `VoceFocus` — rendi cliccabili indirizzo e coordinata**

In `components/modules/rapportini/VoceFocus.tsx`:

Aggiungi l'import (dopo riga 7):

```ts
import { mapsUrlFromAddress, mapsUrlFromCoordinate } from '@/utils/rapportini/mapsLink';
```

Sostituisci il blocco `dett`/`indirizzo` (righe 41-45) per: (a) escludere `coordinate` dai dettagli (sarà link dedicato), (b) ricavare la coordinata e se è abilitata nel template:

```ts
  const titolo = titoloVoce(voce, titoloCampi, indice);
  const indirizzo = [valoreInfo(voce, 'via'), valoreInfo(voce, 'comune')].filter(Boolean).join(', ');
  const fascia = valoreInfo(voce, 'fascia_oraria');
  const coordinata = valoreInfo(voce, 'coordinate');
  const coordinataAbilitata = dettaglio.some((c) => c.chiave === 'coordinate');
  const dett = dettaglio
    .filter((c) => c.chiave !== 'coordinate')
    .map((c) => ({ label: c.etichetta, value: valoreInfo(voce, c.chiave) }))
    .filter((r) => r.value !== '');
```

Sostituisci il rendering dell'indirizzo (righe 70-75) con un link Maps + il link "Punto esatto":

```tsx
            {indirizzo && (
              <a
                href={mapsUrlFromAddress(valoreInfo(voce, 'via'), valoreInfo(voce, 'comune'), valoreInfo(voce, 'cap'))}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[var(--brand-primary)] underline-offset-2 hover:underline"
              >
                <svg className="h-[17px] w-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 1118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                <span>{indirizzo}</span>
              </a>
            )}
            {coordinataAbilitata && coordinata && (
              <a
                href={mapsUrlFromCoordinate(coordinata)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[var(--brand-primary)] underline-offset-2 hover:underline"
              >
                <svg className="h-[17px] w-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /></svg>
                <span>Punto esatto · {coordinata}</span>
              </a>
            )}
```

- [ ] **Step 4: Verifica tipi**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add app/r/[token]/page.tsx components/modules/rapportini/RapportinoForm.tsx components/modules/rapportini/VoceFocus.tsx
git commit -m "feat(rapportini): indirizzo e coordinata cliccabili (apri Maps) nel rapportino digitale"
```

---

## Task 6: Vista ufficio (contenuto) — colonna COORDINATE cliccabile

**Files:**
- Modify: `app/hub/rapportini/contenuto/[id]/page.tsx`

> Verifica con `tsc` + manuale.

- [ ] **Step 1: Importa gli helper**

In `app/hub/rapportini/contenuto/[id]/page.tsx`, dopo l'import esistente di `infoCampi` (riga 6) aggiungi alla lista importata `coordinateFromRaw` e aggiungi un import per il link Maps:

```ts
import { resolveInfoCampi, valoreInfo, coordinateFromRaw, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import { mapsUrlFromCoordinate } from '@/utils/rapportini/mapsLink';
```

- [ ] **Step 2: Aggiungi `raw_json` al select e inietta `coordinate`**

Nel select delle voci (riga 63) aggiungi `, raw_json`:

```ts
    .select('id, ordine, nominativo, matricola, pdr, odl, via, comune, cap, recapito, attivita, accessibilita, fascia_oraria, risposte, raw_json')
```

Sostituisci la costruzione di `voci` (righe 69-71) con un `.map` che inietta la coordinata:

```ts
  const voci = ((vociRows ?? []) as Array<
    VoceInfo & { id: string; ordine: number; risposte: Record<string, unknown> | null; raw_json?: unknown }
  >).map((v) => ({ ...v, coordinate: coordinateFromRaw(v.raw_json) }));
```

- [ ] **Step 3: Rendi cliccabile la cella COORDINATE**

Sostituisci la cella info nel corpo tabella (righe 110-112) con:

```tsx
                  {infoVis.map((c) => {
                    const val = valoreInfo(v, c.chiave);
                    return (
                      <td key={`i-${c.chiave}`} className={TD}>
                        {c.chiave === 'coordinate' && val ? (
                          <a href={mapsUrlFromCoordinate(val)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-primary)' }}>{val}</a>
                        ) : (
                          val || '—'
                        )}
                      </td>
                    );
                  })}
```

- [ ] **Step 4: Verifica tipi**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add app/hub/rapportini/contenuto/[id]/page.tsx
git commit -m "feat(rapportini): colonna COORDINATE cliccabile nella vista ufficio"
```

---

## Task 7: Export Excel — colonna COORDINATE come hyperlink

**Files:**
- Modify: `lib/rapportini/exportStandard.ts`

> Verifica con `tsc` + manuale (l'export è `server-only` + legge il template da filesystem: non unit-testabile in isolamento, come il resto del modulo).

- [ ] **Step 1: Importa gli helper**

In `lib/rapportini/exportStandard.ts`, modifica l'import di `infoCampi` (riga 5) per includere `coordinateFromRaw` e aggiungi l'import del link Maps:

```ts
import { resolveInfoCampi, valoreInfo, coordinateFromRaw, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import { mapsUrlFromCoordinate } from '@/utils/rapportini/mapsLink';
```

- [ ] **Step 2: Inietta `coordinate` nelle voci prima del calcolo colonne**

In `buildRapportinoXlsx`, dopo `const ws = wb.worksheets[0];` e il controllo (riga 85), prima di `const info = ...`, aggiungi:

```ts
  const vociC = voci.map((v) => ({ ...v, coordinate: coordinateFromRaw(v.raw_json) }));
```

Poi sostituisci `voci` con `vociC` nei due punti che lo usano:
- riga ~90-92: `voci.length > 0 ? colonneVisibili(info, campiOrd, voci as unknown as VoceColonne[]) : ...` → usa `vociC.length` e `vociC as unknown as VoceColonne[]`.
- riga ~103: `const ordered = [...voci].sort(...)` → `const ordered = [...vociC].sort(...)`.

- [ ] **Step 3: Scrivi la cella COORDINATE come hyperlink**

Sostituisci il loop dei campi info (righe 111-115) con:

```ts
    for (const c of infoVis) {
      const val = valoreInfo(v as VoceInfo, c.chiave);
      if (c.chiave === 'coordinate' && val) {
        rr.getCell(col).value = { text: val, hyperlink: mapsUrlFromCoordinate(val) };
      } else {
        rr.getCell(col).value = val;
      }
      if (c.chiave === 'fascia_oraria') rr.getCell(col).numFmt = '@';
      col++;
    }
```

> `v` nel loop ora proviene da `vociC` (ha `coordinate`); `valoreInfo` la legge. ExcelJS accetta `{ text, hyperlink }` come valore cella.

- [ ] **Step 4: Verifica tipi**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add lib/rapportini/exportStandard.ts
git commit -m "feat(rapportini): colonna COORDINATE come hyperlink nell'export Excel"
```

---

## Task 8: Verifica finale

**Files:** nessuna modifica (solo verifiche).

- [ ] **Step 1: Suite test completa**

Run: `npm test`
Expected: tutti i test verdi, inclusi i nuovi (`parseCoordinate`, `excelParser`, `infoCampi`, `mapsLink`).

- [ ] **Step 2: Typecheck completo**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Lint sui file toccati** (la baseline lint del repo è già rossa — verificare solo i file del WP)

Run:
```bash
npx eslint utils/routing/parseCoordinate.ts utils/routing/excelParser.ts utils/routing/types.ts utils/rapportini/infoCampi.ts utils/rapportini/mapsLink.ts components/modules/rapportini/VoceFocus.tsx components/modules/rapportini/RapportinoForm.tsx app/r/[token]/page.tsx app/hub/rapportini/contenuto/[id]/page.tsx lib/rapportini/exportStandard.ts
```
Expected: nessun nuovo errore/warning sui file elencati.

- [ ] **Step 4: Build di produzione**

Run: `npm run build`
Expected: build completata senza errori.

- [ ] **Step 5: Test manuali (anteprima Vercel — dopo `git push` con OK utente)**

1. **Import con coordinate:** importa dalla mappa un file con colonne `Lat`/`Long` (es. ZAGAROLO). Nelle *Impostazioni → Template rapportini* attiva il campo **COORDINATE**. Genera il rapportino → apri il link `/r/[token]`:
   - nella scheda intervento l'**indirizzo** è cliccabile e apre Maps in ricerca;
   - compare **"Punto esatto · lat, lng"** cliccabile che apre Maps sul punto;
   - le coordinate sono col **punto** (es. `41.853675, 12.7888783`).
2. **Import senza coordinate:** importa un file privo di Lat/Long → il campo COORDINATE resta **vuoto**; l'indirizzo resta cliccabile.
3. **Routing invariato:** verifica che l'ordine/percorso degli interventi sulla mappa sia identico a prima (le coordinate del file non alterano il geocoding/routing).
4. **Vista ufficio:** `/hub/rapportini/contenuto/[id]` mostra la colonna COORDINATE come link (dove presente).
5. **Export Excel:** scarica l'Excel → colonna COORDINATE presente con hyperlink cliccabile; vuota dove mancano le coordinate.

- [ ] **Step 6: Commit finale (se restano modifiche non committate)**

```bash
git status --short
# se ci sono modifiche dei file del WP:
git add -A -- utils/ components/ app/ lib/
git commit -m "chore(rapportini): verifica finale coordinate committente"
```

---

## Note per chi esegue

- **Perché niente migration:** la coordinata vive nel `raw_json` della voce (popolato a generazione dal task della mappa). `interventi.lat/lng` e la logica geocoding NON si toccano.
- **Perché NON aggiungere `coordinate` a `VoceSnapshot`/`Voce` in `buildVoci.ts`:** in `genera/route.ts` l'oggetto voce viene spread (`...v`) nell'`insert` su `rapportino_voci`; un campo `coordinate` colpirebbe una colonna inesistente → errore. La coordinata deve restare solo nel `raw_json`.
- **Gating UI:** il link "Punto esatto" nell'operatore appare solo se COORDINATE è attivo nel template (presente in `dettaglio`) **e** la voce ha la coordinata. L'indirizzo è sempre cliccabile.
- **Rollout:** solo dopo OK utente → `git push` (anteprima Vercel) → test manuali → merge ff in `main` → elimina branch.
