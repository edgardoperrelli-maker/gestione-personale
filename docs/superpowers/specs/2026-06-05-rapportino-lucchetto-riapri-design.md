# Design — Lucchetto "riapri rapportino" (admin)

- **Data:** 2026-06-05
- **Stato:** approvato dall'utente (in attesa di revisione finale della spec)
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase · zod · Vitest
- **Collegato a:** [Rapportini interattivi](2026-05-31-rapportini-interattivi-design.md) · [Redesign mobile](2026-06-04-rapportino-mobile-redesign-design.md)

---

## 1. Contesto e obiettivo

Quando un operatore **invia** il rapportino, questo passa a `stato='inviato'` e diventa **sola lettura**: gli endpoint `/api/r/[token]/voce` (autosave) e `/api/r/[token]/invia` rispondono **409** se `tokenStatus !== 'valido'`, e il form pubblico mostra "Rapportino inviato ✓" + il pulsante **"📄 Condividi PDF"**.

L'admin deve poter **riaprire** un rapportino inviato — con un **lucchetto** accanto a ogni riga nel riepilogo — così l'operatore può **modificarlo**, **rinviarlo** e **rigenerare il PDF**.

Il PDF lato operatore esiste già ([`CondividiPdfButton`](../../../components/modules/rapportini/CondividiPdfButton.tsx)) ed è generato **client-side, on-demand dai dati correnti**; anche l'export Excel admin è on-demand. Quindi **rigenerazione = automatica al re-invio/ri-download**: questa feature **non tocca** PDF/Excel.

## 2. Scope

**In scope:**
- **Lucchetto** per riga rapportino nel riepilogo ([CardTerritorio](../../../components/modules/mappa/riepilogo/CardTerritorio.tsx) + componente padre): 🔓 quando modificabile, 🔒 quando bloccato; clic sul 🔒 → riapre (1 clic, niente conferma).
- **API admin** `POST /api/admin/rapportini/riapri` (`requireAdmin`): `stato='in_corso'`, `submitted_at=null`, `riaperto_at=now`.
- **Estensione validità**: colonna `rapportini.riaperto_at` + `tokenStatus` che la onora (valido per **48h dal clic**), così il link torna usabile anche su rapportini la cui `data` lavori è passata.
- Aggiornamento dei **5 chiamanti** di `tokenStatus` (e dei rispettivi `select`) per passare `riaperto_at`.
- Migrazione SQL additiva.

**Fuori scope (non-goals):**
- Modifiche a PDF/Excel (già on-demand: si rigenerano da soli). Niente nuovo generatore.
- "Ri-blocco" manuale lato admin (il lucchetto si chiude **da solo** quando l'operatore re-invia).
- Riapertura degli **interventi** collegati: restano aggiornati dalla propagazione live dell'autosave voce + dal re-invio (vedi §9). La `riapri` tocca solo il rapportino.
- Cambiare la `data` lavori (resta immutata: compare nell'Excel/PDF e guida il collegamento agli interventi).
- Conferma/dialog prima del riapri (richiesto "basta che clicco").

## 3. Decisioni (confermate con l'utente)

| Tema | Decisione |
|---|---|
| Metafora | **Lucchetto** = "l'operatore può modificare?". 🔓 aperto = `in_corso` & valido · 🔒 chiuso = `inviato` **o** scaduto |
| Azione | Clic sul 🔒 → **riapre** (1 clic). Si **richiude da solo** al re-invio dell'operatore |
| Chi | Solo **admin** (`requireAdmin`) |
| Validità al riapri | Finestra di **48h dal clic** (`GIORNI_VALIDITA`), `data` lavori intatta |
| PDF / Excel | Nessuna modifica: si rigenerano on-demand |

## 4. UX del lucchetto

Nel riepilogo `/hub/mappa`, riga di ogni operatore/rapportino ([CardTerritorio](../../../components/modules/mappa/riepilogo/CardTerritorio.tsx)), accanto a 🔗/👁/⤓:
- **`statoCalcolato === 'valido'`** → **🔓** (indicatore "aperto/modificabile", non azionabile).
- **`statoCalcolato === 'inviato'` o `'scaduto'`** → **🔒** (pulsante): clic → chiama `onRiapriRapportino(r.id)` → diventa 🔓.
- Stato di caricamento: il 🔒 si disabilita durante la chiamata; on success la riga passa a 🔓 (aggiornamento ottimistico dello `statoCalcolato` o ricarica del riepilogo).
- Coerente con lo stile a emoji già usato nella riga (🔗📲👁⤓✕).

Il componente **padre** (`RiepilogoRapportini`) implementa `onRiapriRapportino(rapportinoId)`: POST all'API, poi aggiorna lo stato locale; `CardTerritorio` riceve la callback come prop e renderizza il lucchetto in base a `statoCalcolato`.

## 5. API admin `riapri`

`app/api/admin/rapportini/riapri/route.ts` (nuovo, `runtime nodejs`):
- **`requireAdmin`** (stesso pattern di [rapportino-template](../../../app/api/admin/rapportino-template/route.ts): controlla `profiles.role`/`app_metadata.role` = admin).
- Body validato con zod: `{ rapportinoId: string (uuid) }`.
- Effetto:
  ```ts
  await supabaseAdmin.from('rapportini')
    .update({ stato: 'in_corso', submitted_at: null, riaperto_at: new Date().toISOString() })
    .eq('id', rapportinoId);
  ```
- Risposta `{ ok: true }`; 401/403 se non admin, 400 se body invalido, 500 su errore DB.

## 6. Modello dati

```sql
-- supabase/migrations/<ts>_rapportino_riaperto_at.sql
alter table rapportini
  add column if not exists riaperto_at timestamptz;
```
- Additiva, retro-compatibile (`null` = mai riaperto → comportamento storico).
- Nessuna colonna sulle voci. `data`, `expires_at`, `submitted_at` invariati.

## 7. `tokenStatus` + finestra di riapertura (modifica centrale)

`tokenStatus` è oggi chiamato in **5 punti**: `app/api/r/[token]/invia/route.ts`, `app/api/r/[token]/voce/route.ts`, `app/r/[token]/page.tsx`, `app/api/mappa/rapportini/riepilogo/route.ts:50`, `app/api/mappa/rapportini/route.ts:36`.

**`utils/rapportini/scadenza.ts`** — nuovo helper puro:
```ts
/** Riapertura valida per GIORNI_VALIDITA giorni (48h) dall'istante `riapertoAt`. */
export function entroRiapertura(riapertoAtIso: string, nowIso: string): boolean {
  const t = Date.parse(riapertoAtIso);
  if (Number.isNaN(t)) return false;
  return Date.parse(nowIso) < t + GIORNI_VALIDITA * 86_400_000;
}
```

**`utils/rapportini/tokenStatus.ts`** — onora `riaperto_at` (firma estesa, `riaperto_at` opzionale → retro-compatibile):
```ts
import { isScaduto, entroRiapertura } from './scadenza';

export function tokenStatus(
  r: { stato: RapportinoStato; data: string; riaperto_at?: string | null },
  nowIso: string,
): 'valido' | 'scaduto' | 'inviato' {
  if (r.stato === 'inviato') return 'inviato';
  if (r.riaperto_at && entroRiapertura(r.riaperto_at, nowIso)) return 'valido';
  return isScaduto(r.data, nowIso) ? 'scaduto' : 'valido';
}
```
- L'override agisce **solo** nel ramo `in_corso` (un rapportino re-inviato torna `'inviato'` e si ri-blocca, a prescindere da `riaperto_at`).
- Per i rapportini mai riaperti (`riaperto_at` null) → **nessun cambiamento** di comportamento.

**5 chiamanti**: aggiungere `riaperto_at` al `select` e passarlo a `tokenStatus`:
- `invia/route.ts` (select `id, stato, data, campi_snapshot` → + `riaperto_at`).
- `voce/route.ts` (select `id, stato, data, campi_snapshot, staff_id` → + `riaperto_at`).
- `page.tsx` (select rapportino → + `riaperto_at`; passare a `tokenStatus`).
- `riepilogo/route.ts` (select `…, expires_at, submitted_at` → + `riaperto_at`; il calcolo `statoCalcolato` lo usa → il lucchetto si aggiorna).
- `mappa/rapportini/route.ts` (idem).

## 8. PDF / Excel — nessuna modifica

- **PDF operatore** ([CondividiPdfButton](../../../components/modules/rapportini/CondividiPdfButton.tsx)): appare solo quando `inviato`, genera client-side dai dati correnti. Dopo **riapri → modifica → re-invio**, ricompare e produce un **PDF nuovo** con i dati aggiornati. ✔ automatico.
- **Excel admin** ([export route](../../../app/api/mappa/rapportini/export/route.ts)): on-demand dai dati freschi → **ri-scaricare** = aggiornato. ✔ automatico.

## 9. Comportamento e stati

| Caso | Comportamento |
|---|---|
| Rapportino `inviato` | 🔒; clic admin → `in_corso` + `riaperto_at=now` → 🔓; operatore modifica |
| Rapportino `scaduto` (in_corso, link morto) | 🔒; clic admin → riapre + estende 48h → 🔓 editabile |
| Rapportino `valido` (in compilazione) | 🔓 (indicatore); nessuna azione admin |
| Dopo riapri: autosave/invio | `/voce` e `/invia` tornano a rispondere `valido` (no 409) finché entro la finestra |
| Re-invio operatore | `stato='inviato'` → 🔒 di nuovo; PDF/Excel rigenerabili |
| Interventi collegati | Aggiornati dalla propagazione live su modifica voce + ri-chiusi al re-invio; la `riapri` non li tocca |
| `riaperto_at` scade (>48h, non re-inviato) | Torna `scaduto` → 🔒; l'admin può ri-cliccare per estendere |
| Migrazione non applicata | `select riaperto_at` darebbe errore lato API → **applicare la SQL prima del deploy** (vedi §10) |

## 10. Migrazione prod

Additiva e non-breaking. **A differenza** della feature precedente, qui i `select` aggiungono `riaperto_at` su rotte usate anche dal flusso pubblico (`/voce`,`/invia`,`page.tsx`) e admin: se la colonna non esiste, quei `select` vanno in errore. Quindi la SQL va applicata sul DB **prod prima** del deploy del codice (la lancia l'utente; il Supabase MCP non punta al prod). SQL consegnata su richiesta.

## 11. Testing (Vitest + verifica)

**Funzioni pure (TDD):**
- `entroRiapertura(riapertoAt, now)`: true entro 48h, false oltre, false su data invalida.
- `tokenStatus` con `riaperto_at`: riaperto recente + `data` vecchia → `'valido'`; riaperto vecchio → fallback a `isScaduto(data)`; `stato='inviato'` → `'inviato'` anche con `riaperto_at` recente; `riaperto_at` null → comportamento storico (regressione coperta dai test esistenti).

**Build + verifica manuale:** `npx tsc --noEmit`, `npx eslint <file toccati>`, `npm run build`; verifica admin (lucchetto su riga inviata → clic → diventa 🔓) + operatore (link torna modificabile → re-invio → PDF rigenerato).

## 12. File coinvolti

| Area | File |
|---|---|
| Helper validità (+ test) | `utils/rapportini/scadenza.ts`, `utils/rapportini/tokenStatus.ts`, `utils/rapportini/tokenStatus.test.ts` |
| Migrazione SQL (nuova) | `supabase/migrations/<ts>_rapportino_riaperto_at.sql` |
| API admin (nuova) | `app/api/admin/rapportini/riapri/route.ts` |
| Chiamanti tokenStatus | `app/api/r/[token]/invia/route.ts`, `app/api/r/[token]/voce/route.ts`, `app/r/[token]/page.tsx`, `app/api/mappa/rapportini/riepilogo/route.ts`, `app/api/mappa/rapportini/route.ts` |
| UI lucchetto | `components/modules/mappa/riepilogo/CardTerritorio.tsx` + padre `RiepilogoRapportini` |

## 13. Fuori scope / passi futuri

- Storico/audit delle riaperture (chi/quando) oltre a `riaperto_at`.
- Notifica all'operatore alla riapertura (es. WhatsApp).
- Ri-blocco manuale admin senza attendere il re-invio.
