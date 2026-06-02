# Design — Assegnazione interventi (per-riga + massiva, dalla lista)

- **Data:** 2026-06-02
- **Stato:** approvato dall'utente · pronto per il piano di implementazione
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router) · React 19 (tabella interattiva client) · TypeScript · Supabase (`supabaseAdmin`) · Vitest · tema Aurea `--brand-*`
- **Collegato a:** [Coordinamento operatori](2026-06-01-coordinamento-operatori-interventi-design.md) §5.3 · [Lista interventi](2026-06-02-lista-interventi-design.md) · [Data-model Acea](2026-06-01-interventi-acea-datamodel-design.md)

---

## 1. Contesto e obiettivo

Completa la **Fase 1**: assegnare gli interventi importati agli **operatori** direttamente dall'app (`staff_id` + `stato='assegnato'`), partendo dalla **lista** già esistente. È il **prerequisito della tracciatura** (Fase 2): senza assegnazione, l'operatore non ha "i suoi interventi".

## 2. Decisioni (confermate dall'utente)

| Tema | Scelta |
|---|---|
| Dove | Dalla **lista** `/hub/interventi/lista`: assegnazione **per riga** + **massiva**. |
| Riassegnazione | **Permissiva** su tutti gli stati **non terminali** (anche "avviati" → reset a `assegnato`); `completato`/`annullato` **bloccati** (riapertura = azione dedicata futura). |
| Massiva | checkbox per riga + barra azioni "Assegna N selezionati a [operatore]". |
| Operatori | `staff` **validi per la data** della lista (`isStaffValidOnDay`). |
| SQL | **Nessuna** — `staff_id` / `stato` / `assegnato_at` / `iniziato_at` già presenti su `interventi`. |

## 3. Helper puro — `lib/interventi/assegnazione.ts`

```ts
import type { StatoIntervento } from './statoInterventi';

export type AssegnaPatch = {
  staff_id: string | null;
  stato: StatoIntervento;            // 'assegnato' | 'da_assegnare'
  assegnatoAt: 'set' | 'keep' | 'clear';
  azzeraAvvio: boolean;              // azzera iniziato_at/chiuso_at (reset da stato avviato)
};
export type EsitoPianificazione = { ok: true; patch: AssegnaPatch } | { ok: false; errore: string };

export function pianificaAssegnazione(statoCorrente: StatoIntervento, staffId: string | null): EsitoPianificazione;
```

Regole:
- **Terminali** (`completato`, `annullato`) → `{ ok:false, errore }` (sia assegna sia disassegna).
- **Assegna/riassegna** (`staffId` valorizzato):
  - `da_assegnare` → `stato='assegnato'`, `assegnatoAt:'set'`, `azzeraAvvio:false`.
  - `assegnato` → cambia operatore, `assegnatoAt:'keep'`, `azzeraAvvio:false`.
  - `in_viaggio`/`sul_posto`/`in_esecuzione` → reset a `'assegnato'`, `assegnatoAt:'keep'`, `azzeraAvvio:true`.
- **Disassegna** (`staffId` null):
  - `assegnato` (o stato avviato) → `stato='da_assegnare'`, `staff_id=null`, `assegnatoAt:'clear'`, `azzeraAvvio:` (true se era avviato).
  - `da_assegnare` → no-op (`assegnatoAt:'keep'`).

La rotta applica i timestamp: `assegnato_at = now()` se `'set'`, `null` se `'clear'`, invariato se `'keep'`; se `azzeraAvvio`, azzera `iniziato_at`/`chiuso_at`.

## 4. Rotta — `POST /api/interventi/assegna` (`requireUser` + `supabaseAdmin`, `runtime='nodejs'`)

Body `{ ids: string[], staffId: string | null }` (per-riga = `[id]`; massiva = selezione).
- Carica `id, stato` degli `ids` (una query `.in('id', ids)`).
- Per ciascuno: `pianificaAssegnazione(stato, staffId)`; se ok → `update` (`staff_id`, `stato`, `assegnato_at` per direttiva, e `iniziato_at=null`/`chiuso_at=null` se `azzeraAvvio`); se ko → in `scartati`.
- Risposta `{ assegnati: number, scartati: Array<{ id, errore }> }`.

## 5. UI — `components/modules/interventi/InterventiAssegnabili.tsx` (`'use client'`)

Sostituisce la tabella presentational `InterventiTable` nella lista (è l'unica consumer). Riceve `rows: InterventoRow[]` + `operators: { id: string; display_name: string }[]`.
- Stato `selected: Set<string>` + "seleziona tutti (filtrati)".
- **Tabella**: colonna checkbox + colonne display (ODL · Indirizzo · Comune · Committente · Stato via `labelStato` · Geocodifica via `badgeGeocode`) + colonna **Operatore** (`<select>` per riga: "— Non assegnato" + operatori; valore = `staff_id` corrente).
- **Barra massiva** (visibile con ≥1 selezione): picker operatore + "Assegna N" + "Annulla selezione".
- Righe **terminali** (`completato`/`annullato`): checkbox + `<select>` disabilitati (etichetta operatore in sola lettura).
- Ogni azione (per-riga o massiva) → `POST /api/interventi/assegna { ids, staffId }` → su ok `router.refresh()`; `busy` + errori inline (anche `scartati`).

## 6. Pagina lista — `app/hub/interventi/lista/page.tsx` (modifica)

Oltre alla query interventi: carica `staff` (id, display_name, valid_from, valid_to), filtra con `isStaffValidOnDay(..., filters.data, filters.data)`, mappa a `{ id, display_name }`. Renderizza `<InterventiAssegnabili rows={interventi} operators={operatori} />` (al posto di `<InterventiTable>`). La query interventi include già `staff_id` (aggiungerlo al `select` e a `InterventoRow`).

## 7. Refactor di supporto

- **Sposta** il tipo `InterventoRow` in `lib/interventi/interventiView.ts` (+ campo `staff_id: string | null`) così è condiviso tra pagina e componente; aggiorna gli import.
- **Rimuovi** `components/modules/interventi/InterventiTable.tsx` (sostituita).

## 8. Gestione errori

- Stato terminale → l'id finisce in `scartati` con motivo; la UI mostra "N non assegnabili (completati/annullati)".
- Errore DB → `500 { error }`; la UI mostra il messaggio, nessun refresh.
- `staffId` non in `staff` validi: la rotta non valida l'esistenza dello staff (fiducia nel set passato dalla UI); opzionale hardening futuro.

## 9. Test (Vitest, logica pura)

`pianificaAssegnazione`: `da_assegnare`→assegna(set); `assegnato`→riassegna(keep); `in_esecuzione`→riassegna(reset, azzeraAvvio); `assegnato`→disassegna(clear); `da_assegnare`→disassegna(no-op); `completato`→rifiuto; `annullato`→rifiuto.

## 10. Fuori scope

- Riapertura di interventi `completato` (azione dedicata, futura).
- Assegnazione drag&drop su mappa; bilanciamento/carico operatore.
- Generazione rapportini dagli `interventi` (passo verso la tracciatura, Fase 2).
