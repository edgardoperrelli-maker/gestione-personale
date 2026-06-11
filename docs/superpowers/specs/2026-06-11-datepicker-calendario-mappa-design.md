# DatePicker a tema — calendario per la pagina Mappa

**Data:** 2026-06-11
**Stato:** approvato (design)

## Problema

Nella pagina Mappa (`/hub/mappa?vista=pianifica`) la data si seleziona con
`<input type="date">` nativi: uno nel modale "Configura pianificazione"
(`setupModalDate`) e uno nella toolbar in alto (`planningDate`). Il picker nativo
del browser è renderizzato dal sistema operativo e **non segue il tema Aurea**
(dark navy / cyan neon / Geist), risultando visivamente estraneo all'interfaccia.

## Obiettivo

Sostituire entrambi i campi data della pagina Mappa con un calendario **a tema**,
coerente con il design Aurea, mantenendo identico il comportamento funzionale
(stessa logica `value`/`onChange`, stesso `disabled`, stessi side-effect).

## Decisioni prese

- **Interazione:** popover sul campo. Resta un campo cliccabile che mostra la data
  formattata (`11/06/2026`); al click si apre sotto un calendario a tema. Stesso
  componente sia nel modale sia nella toolbar.
- **Ambito:** entrambi i campi data della pagina Mappa (`setupModalDate` nel modale
  + `planningDate` nella toolbar).
- **Build:** componente custom, nessuna libreria. Nessuna lib di date è installata
  e il tema Aurea (oklch, glow, Geist) richiederebbe comunque un override pesante
  di una lib esterna. Custom = controllo totale, zero peso, riutilizzabile altrove.

## Componente: `components/ui/DatePicker.tsx`

Client component (`'use client'`) riutilizzabile.

### Props

| Prop | Tipo | Note |
|------|------|------|
| `value` | `string` | ISO `YYYY-MM-DD`, oppure `''` se non selezionata |
| `onChange` | `(iso: string) => void` | riceve sempre ISO `YYYY-MM-DD` |
| `disabled` | `boolean?` | trigger non cliccabile, stile attenuato |
| `min` | `string?` | ISO; giorni precedenti disabilitati |
| `max` | `string?` | ISO; giorni successivi disabilitati |
| `placeholder` | `string?` | default `gg/mm/aaaa` |
| `className` | `string?` | classi extra sul trigger |
| `ariaLabel` | `string?` | etichetta accessibile del trigger |

### Trigger

- `<button type="button">` stilizzato come gli input esistenti:
  `rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)]`,
  testo `var(--brand-text-main)`, focus glow cyan come gli altri input.
- Mostra `formatDisplay(value)` (`dd/mm/yyyy`) oppure il placeholder in
  `var(--brand-text-subtle)`. Icona calendario a destra.
- `disabled` → `opacity-50 cursor-not-allowed`, popover non apribile.

### Popover

- Posizionato sotto il trigger (`absolute`, `z` alto perché usato dentro un modale
  con overlay `z-50` → il popover deve stare sopra).
- `bg-[var(--brand-surface)]`, `border-[var(--brand-border)]`, `rounded-xl`,
  `--shadow-lg` + glow cyan, padding compatto.
- **Header:** label mese+anno in italiano (`Giugno 2026`) centrato, frecce
  `‹` `›` ai lati per mese precedente / successivo (solo navigazione vista, non
  cambiano il valore selezionato).
- **Riga giorni:** `Lun Mar Mer Gio Ven Sab Dom` (lunedì-first, coerente con
  `CronoCalendarView`), testo `var(--brand-text-muted)`.
- **Griglia 6×7:** celle giorno.
  - Giorni del mese corrente: cliccabili.
  - Giorni fuori mese (riempimento): attenuati, non cliccabili.
  - **Oggi:** ring cyan (`ring-[var(--brand-primary)]`).
  - **Selezionato:** pieno `bg-[var(--brand-primary)]` con testo scuro
    (`text-[oklch(0.16_0.06_245)]`, come gli altri bottoni primary).
  - Weekend: testo leggermente smorzato (estetico, restano cliccabili).
  - Fuori da `min`/`max`: disabilitati.
- **Footer:** bottone **Oggi** che seleziona la data odierna e chiude.

### Comportamento

- Apertura: click sul trigger (se non `disabled`).
- Chiusura: selezione di un giorno, click fuori (listener su `document`), tasto
  `Esc`.
- Alla riapertura il mese mostrato parte dal mese di `value` se presente,
  altrimenti dal mese corrente.

### Robustezza fuso orario

Parse/format manuali — **mai** `new Date('2026-06-11')` (interpretato UTC →
possibile shift di giorno in fuso locale). Helper:

- `parseIso(iso)` → `{ y, m, d }` via split di stringa.
- `toIso(y, m, d)` → `YYYY-MM-DD` con zero-padding.
- `formatDisplay(iso)` → `dd/mm/yyyy`.
- `buildMonthGrid(year, month)` → matrice di 6×7 `{ date, inMonth }`
  (lunedì-first), funzione pura.

Queste 4 funzioni sono pure e vivono in un modulo separato
`components/ui/datePickerUtils.ts` per essere testabili.

## Integrazione in `MappaOperatoriClient.tsx`

Sostituire i due `<input type="date">`:

1. **Modale "Configura pianificazione"** (campo `setupModalDate`):
   `<DatePicker value={setupModalDate} onChange={setSetupModalDate} />`.
2. **Toolbar "Data"** (campo `planningDate`):
   `<DatePicker value={planningDate} disabled={isEditMode || setupDone}
   onChange={(iso) => { if (isEditMode || setupDone) return; if (iso) {
   setPlanningDate(iso); setSelectedOps([]); setDistribution(null); } }} />`.

Nessun'altra logica cambia: i valori restano ISO `YYYY-MM-DD` come prima.

## Testing

- **Unit (vitest)** su `datePickerUtils.ts`: `parseIso`, `toIso`, `formatDisplay`,
  `buildMonthGrid` (numero celle = 42, allineamento lunedì-first, flag `inMonth`,
  niente shift di fuso). Coerente con la baseline esistente: nessun nuovo errore
  lint/test introdotto dai file del work package.
- **Interattivo:** verifica a vista sul deploy (apertura popover, selezione,
  navigazione mesi, click-fuori/Esc, stato `disabled` in toolbar quando
  `setupDone`/`isEditMode`).

## Fuori scope (YAGNI)

- Range/multi-data, orari, localizzazione oltre l'italiano.
- Navigazione completa da tastiera con frecce (resta solo `Esc` + click). Si
  potrà aggiungere in seguito se richiesto.
- Adozione del componente su altre pagine (Riepilogo, Monitoraggio…): possibile in
  futuro, non in questo work package.
