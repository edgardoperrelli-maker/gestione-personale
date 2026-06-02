# Design — UI Import Interventi (Dashboard)

- **Data:** 2026-06-02
- **Stato:** approvato dall'utente · pronto per il piano di implementazione
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router) · React 19 (client component) · TypeScript · Tailwind 4 (tema Aurea `--brand-*`) · Vitest
- **Collegato a:** [Coordinamento operatori & tracciatura interventi](2026-06-01-coordinamento-operatori-interventi-design.md) §5.1 · rotta `POST /api/interventi/import` (già esistente)

---

## 1. Contesto e obiettivo

La rotta `POST /api/interventi/import` (Excel → tabella `interventi`) **esiste già ed è testata**, ma non ha interfaccia: oggi un import si potrebbe fare solo con una chiamata HTTP manuale. Questo spec definisce la **UI di import** — il TODO #1 del piano interventi — una pagina che permette all'ufficio di caricare un Excel, scegliere committente e data, e vedere l'esito.

È il primo mattone *usabile* della Fase 1 ("gli interventi vivono nel DB"): rende l'import un'operazione self-service senza toccare la logica di parsing/dedup già scritta.

## 2. Scope

**In scope:**
- Nuova pagina `/hub/interventi` con form di import (file + committente + data + lotto) che chiama la rotta esistente.
- Riepilogo dell'esito (righe totali / inseriti / aggiornati) e gestione errori.
- Registrazione del nuovo modulo "Interventi" nella navigazione (Sidebar).

**Fuori scope (TODO successivi):**
- Geocoding post-import (#2, rotta `/api/interventi/geocode` non ancora esistente).
- Anteprima/lista degli interventi importati, assegnazione, tracciatura (#3+).
- Qualunque modifica alla rotta `/api/interventi/import` o ai parser Excel.

## 3. Decisioni (confermate dall'utente)

| Tema | Scelta |
|---|---|
| Collocazione | **Pagina dedicata** `/hub/interventi` + voce "Interventi" nel menu (non un card sulla home). |
| Ampiezza | **Solo import + riepilogo** (niente anteprima righe, niente geocoding in questo step). |
| Default committente | `italgas` (l'unico testabile ora; coincide col default della rotta). |
| Data | `<input type="date">`, default **oggi** (Europe/Rome) → invia `YYYY-MM-DD`. |
| Lotto | `<select>` opzionale `— / 1 / 2 / 3`, rilevante per Acea. |
| Accesso | Modulo standard come `mappa`/`rapportini` (non `adminOnly`). |

## 4. Architettura & file

**Crea:**
- `app/hub/interventi/page.tsx` — pagina client (`'use client'`) in `<AuthGate>`, con il sotto-componente `ImportInterventiForm`.
- `lib/interventi/importSummary.ts` — helper puro `formatImportSummary()` (testabile, nessuna dipendenza DB/React).
- `lib/interventi/importSummary.test.ts` — test Vitest dell'helper.

**Modifica:**
- `lib/moduleAccess.ts` — aggiunge `'interventi'` al tipo `AppModuleKey` e una entry in `APP_MODULES`:
  ```ts
  {
    key: 'interventi',
    href: '/hub/interventi',
    label: 'Interventi',
    description: 'Import e gestione interventi',
    section: 'modules',
    matchPrefixes: ['/hub/interventi'],
  }
  ```
- `components/layout/moduleIcons.tsx` — aggiunge `MODULE_ICONS.interventi` (il tipo `Record<AppModuleKey, …>` impone la chiave). La voce di menu compare in automatico via `appNavigation`.

La nuova chiave entra in `DEFAULT_ALLOWED_MODULES` (non è `adminOnly`), quindi è visibile come gli altri moduli ed è gestibile per-utente dall'area Utenze senza ulteriori modifiche.

## 5. UI (pattern Aurea, allineato a `rapportini/clientela`)

Card su `--brand-surface`, bordo `--brand-border`, `rounded-[28px]`, header con titolo + descrizione. Campi:

1. **File sorgente** — `input type="file"` nascosto + label "Carica file" / "Sostituisci file", `accept=".xlsx,.xls"`; pulsante "Rimuovi" quando un file è presente.
2. **Committente** — `<select>` `acea | italgas | altro` (default `italgas`).
3. **Data di lavoro** — `<input type="date">`, default oggi.
4. **Lotto (Acea)** — `<select>` `— | 1 | 2 | 3`, sempre visibile e **opzionale**; nessuna logica condizionale sul committente in questo step (l'etichetta segnala che è rilevante per Acea).
5. **Azione** — pulsante "Importa", disabilitato se manca file/data o durante `busy`.

Stati React: `file`, `committente`, `data`, `lotto`, `busy`, `result`, `error`.

## 6. Flusso dati

```
submit
  → costruisci FormData { file, committente, data, lotto? }
  → fetch('/api/interventi/import', { method: 'POST', body })
  → if ok:  result = { committente, data, totaliRighe, inseriti, aggiornati }
            mostra riepilogo, resetta il file
  → if !ok: error = body.error, mostra box errore
```

Nessuna nuova rotta, nessun parsing lato client: il file viaggia così com'è verso la route (`runtime='nodejs'`), che già fa `parseExcelToTasks` + dedup `(committente, odl, data)`.

## 7. Gestione errori

La rotta risponde `{ error }` con stato 400/500. Casi mostrati nel box `--danger`:
- file mancante / non `File`;
- committente non valido;
- data mancante o non in formato `YYYY-MM-DD`;
- "Excel non leggibile" (parser);
- "Nessuna riga valida trovata nel file".

Successo nel box `--success` con i conteggi. Lo stato `busy` blocca il doppio invio; il `fetch` è in `try/catch` per gestire anche errori di rete.

## 8. Test

- `formatImportSummary({ totaliRighe, inseriti, aggiornati })` → stringa leggibile (es. "12 inseriti, 3 aggiornati su 15 righe"); casi: 0 inseriti, solo aggiornati, singolare/plurale. Unit test Vitest, coerente con l'approccio "logica pura" del repo.
- La logica di dedup/insert resta coperta dalla rotta esistente (non duplicata qui).

## 9. Rischi / note

- L'import applica **una sola `data`** a tutte le righe (limite noto ereditato dal parser): l'utente sceglie la data del batch. La rifinitura multi-giorno è un TODO separato.
- Per Acea manca ancora un Excel reale estratto dal portale: la mappatura colonne Acea si verificherà col file vero. Italgas è testabile subito (formato ATTGIORN).
- L'accesso al modulo segue il meccanismo esistente (`allowedModules` + `canAccessPath`); nessun guard nuovo da introdurre.
