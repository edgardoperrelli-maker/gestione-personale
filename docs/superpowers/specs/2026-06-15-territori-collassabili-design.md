# Intestazioni territorio collassabili (vista Calendario cronoprogramma)

**Data:** 2026-06-15
**Stato:** Spec approvata in brainstorming, da rivedere prima del piano

## Problema / Obiettivo
Alleggerire la vista Calendario del cronoprogramma: nelle celle-giorno, quando l'ordinamento è per Territorio, le bande-intestazione di territorio (PERUGIA, FIRENZE, … e "Senza territorio") devono diventare **collassabili**. Collassando un territorio si nascondono le sue card, lasciando solo l'intestazione.

## Decisioni (brainstorming)
- **Solo vista Calendario** (`CronoCalendarView` / `DayCell`). Griglia/Split/Tabella e l'ordinamento "A-Z" invariati.
- **Globale per territorio**: collassare "PERUGIA" lo chiude in **tutti i giorni** della vista (lo stato è per `territory.id`, condiviso fra le celle).
- **Persistenza in `localStorage`** (chiave `crono:collapsedTerritori`): i territori chiusi restano chiusi dopo ricarica/riapertura.

## Comportamento
- La banda colorata del territorio diventa un **`<button>`** (toggle). Cliccandola si collassa/espande quel territorio in tutta la vista.
- **Espanso** (default): `▾ NOME TERRITORIO` + le card sotto (come oggi).
- **Collassato**: `▸ NOME TERRITORIO (n)` — chevron "chiuso" + contatore degli operatori nascosti per quel giorno; le card NON sono renderizzate.
- Il gruppo "Senza territorio" usa la chiave `__none__` ed è collassabile come gli altri.
- Il collasso agisce solo sul rendering: drag&drop, dati, conteggi restano invariati; espandendo, tutto torna come prima.

## Architettura / implementazione
Modifica contenuta a un solo componente + un helper puro.

### Helper `lib/cronoCollapse.ts` (con test)
Isola la logica localStorage (robusta a SSR e JSON malformato):
```ts
const KEY = 'crono:collapsedTerritori';
export function parseCollapsed(raw: string | null): string[]   // pura, testabile
export function loadCollapsed(): string[]                      // legge da localStorage (guard typeof window)
export function saveCollapsed(keys: string[]): void            // scrive su localStorage (guard)
```
`parseCollapsed`: ritorna `[]` se `raw` è null/non-JSON/non-array; altrimenti l'array di stringhe (filtrando i non-string). Test su: null→[], JSON malformato→[], oggetto non-array→[], array valido→stesso, array misto→solo stringhe.

### `CronoCalendarView.tsx`
- Stato: `const [collapsedTerritori, setCollapsedTerritori] = useState<Set<string>>(() => new Set(loadCollapsed()));`
- Toggle:
  ```ts
  const toggleTerritorio = (key: string) => setCollapsedTerritori((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    saveCollapsed([...next]);
    return next;
  });
  ```
- Passa `collapsedTerritori` + `onToggleTerritorio={toggleTerritorio}` a ogni `<DayCell>`; aggiungere i due campi al type dei props di `CronoCalendarView` e `DayCell`.

### `DayCell` — territory grouping
Nel ramo `sortMode === 'TERRITORIO' || 'PER_TERRITORIO'`, per ogni `g` (gruppo territorio, chiave `g.terrId ?? '__none__'`):
- La banda `<div ...>` diventa `<button type="button" onClick={() => props.onToggleTerritorio?.(key)} ...>` (stessi stili + `w-full text-left cursor-pointer`).
- Aggiungere un **chevron** (▾ aperto / ▸ chiuso) all'inizio della banda e, se collassato, il conteggio `(g.items.length)` accanto al nome.
- Renderizzare il `<div className="space-y-1">{g.items.map(...)}</div>` **solo se NON collassato**: `{!collapsed && (<div>…cards…</div>)}`.
- `collapsed = props.collapsedTerritori?.has(key) ?? false`.

## Error handling
- `loadCollapsed`/`saveCollapsed` con guard `typeof window === 'undefined'` (SSR) e try/catch attorno a `localStorage` (quota/privacy mode) → non rompono mai il render.
- Una chiave territorio collassata che in un dato giorno non ha card semplicemente non compare (nessun gruppo) — nessun problema.

## Testing
- `lib/cronoCollapse.test.ts` (vitest): casi di `parseCollapsed` sopra elencati.
- Smoke manuale (deploy): Calendario, ordinamento Territorio → click su una banda territorio la collassa in tutti i giorni (mostra `▸ NOME (n)`); ri-click espande; ricarico la pagina → resta collassato; gli altri ordinamenti/viste invariati.

## Out of scope (follow-up)
- Pulsante "comprimi/espandi tutti".
- Collasso in Vista griglia / Split / Tabella.

## File toccati
- **Nuovi:** `lib/cronoCollapse.ts`, `lib/cronoCollapse.test.ts`.
- **Modificati:** `components/modules/cronoprogramma-personale/CronoCalendarView.tsx`.
