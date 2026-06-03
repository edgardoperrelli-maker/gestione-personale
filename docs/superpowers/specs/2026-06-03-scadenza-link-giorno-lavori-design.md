# Design — Scadenza link rapportini ancorata al giorno dei lavori

- **Data:** 2026-06-03
- **Stato:** in attesa di revisione utente
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router) · React 19 · Supabase · TypeScript · Tailwind 4 · Vitest
- **Collegato a:** [Rapportini interattivi](2026-05-31-rapportini-interattivi-design.md) · [Link rapportini editor mappa](2026-06-01-link-rapportini-editor-mappa-design.md)

---

## 1. Contesto e obiettivo

Ogni rapportino ha un link pubblico (`/r/[token]`) con una scadenza. Oggi la scadenza è
**congelata alla creazione**: in [`genera/route.ts:39`](../../../app/api/mappa/rapportini/genera/route.ts)
si calcola `expires_at = Date.now() + 48h`, cioè 48 ore dal momento in cui si preme "genera".

**Problema pratico:** un link creato **venerdì** per lavori di **lunedì** scade **domenica sera**
→ lunedì è già morto. La finestra di 48h è ancorata al momento sbagliato.

**Obiettivo:** ancorare la validità al **giorno dei lavori**, non al momento di creazione.
Le 48 ore partono dalle **00:00 (ora italiana) del giorno pianificato** (`rapportini.data`).
La regola deve valere **anche per i link già generati** (inclusi quelli per lavori odierni),
senza interventi manuali.

## 2. Scope

**In scope:**
- Nuova regola di scadenza **derivata da `rapportini.data`**: valido per il giorno lavori + il
  giorno successivo; scade alle **00:00 del secondo giorno dopo** (= 48h dalla mezzanotte).
- La regola è **calcolata al volo** → vale subito per tutti i link esistenti non ancora inviati.
- `expires_at` continua a essere popolata alla generazione, ma con il **valore coerente** alla
  nuova regola (non più `now + 48h`).

**Fuori scope (per scelta confermata):**
- Nessun pulsante di **estensione manuale** della validità.
- Nessuna **durata configurabile** da UI (resta 48h = 2 giorni, costante nel codice).
- Nessuna **SQL / migrazione dati**: lo stato è ricalcolato dal giorno lavori, i link esistenti
  si adeguano da soli.
- Nessuna modifica a UI, autosave, invio, export (invariati).

## 3. Decisioni (confermate con l'utente)

| Tema | Scelta |
|---|---|
| Ancoraggio | Le 48h partono dalle **00:00 del giorno lavori** (`data`), non dalla creazione. |
| Comportamento | **Automatico**, nessun intervento manuale (no pulsante "estendi"). |
| Link esistenti | La regola vale **anche per i link già generati**, inclusi quelli **odierni**. |
| Fuso orario | **Europe/Rome** (coerente col resto dell'app: `toLocaleString('sv-SE', { timeZone: 'Europe/Rome' })`). |
| Durata | **48h = 2 giorni di calendario** dalla mezzanotte (costante `GIORNI_VALIDITA`). |

## 4. Comportamento (esempi)

Validità = giorno lavori + giorno successivo; scadenza alle **00:00** del giorno dopo ancora.

| Giorno lavori (`data`) | Quando genero il link | Valido fino a | Stato lunedì |
|---|---|---|---|
| Lunedì | Venerdì / sabato / lunedì | Martedì 23:59 (scade mer 00:00) | **Valido** ✅ |
| Oggi | Oggi | Domani 23:59 (scade dopodomani 00:00) | — |
| 10 giorni fa | Qualsiasi | Già scaduto | Scaduto |

Il momento di generazione **non influisce** più sulla finestra. Lo stato **"Inviato" prevale**
sempre (un rapportino inviato resta inviato anche dopo la scadenza).

## 5. Modello dati

**Nessuna modifica allo schema.** Si riusa la colonna `rapportini.data` (`date`, il giorno
pianificato) come unica fonte di verità per la scadenza. La colonna `expires_at` (NOT NULL)
resta e viene popolata in modo coerente alla generazione, ma **non è più letta** per decidere
lo stato. **Nessuna SQL da lanciare al PC.**

## 6. Logica pura — nuovo modulo `utils/rapportini/scadenza.ts`

Funzioni pure, testabili, fonte di verità unica della regola:

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

**Note di correttezza:**
- `isScaduto` confronta **stringhe `YYYY-MM-DD`** (ordinabili lessicograficamente): nessuna
  aritmetica su istanti con fusi → niente bug di ora legale.
- `scadenzaIso` e `isScaduto` sono **coerenti al millisecondo**: `isScaduto` diventa `true`
  esattamente quando `now` raggiunge `scadenzaIso(data)` (entrambi = 00:00 Roma di `data + 2`).
- Verifica: `scadenzaIso('2026-06-08')` (estate, +02:00) = `2026-06-09T22:00:00.000Z`;
  `scadenzaIso('2026-01-15')` (inverno, +01:00) = `2026-01-16T23:00:00.000Z`.

## 7. `utils/rapportini/tokenStatus.ts` — usa `data` invece di `expires_at`

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

La firma cambia: `expires_at` → `data`. Tutti i chiamanti **già selezionano `data`**, quindi
l'adeguamento è minimo (sotto).

## 8. Chiamanti di `tokenStatus` (3 punti, già selezionano `data`)

| File | Modifica |
|---|---|
| [`app/api/mappa/rapportini/route.ts`](../../../app/api/mappa/rapportini/route.ts) | `r` ha già `data` nel tipo `list` → `tokenStatus(r, now)` invariato; nessun cast da toccare. |
| [`app/api/mappa/rapportini/riepilogo/route.ts`](../../../app/api/mappa/rapportini/riepilogo/route.ts) | Cambiare il cast `r as { stato; expires_at }` → `r as { stato; data }` (riga ~47). `data` è già nel select. |
| [`app/api/r/[token]/route.ts`](../../../app/api/r/[token]/route.ts) | Passa `rap as any` e `data` è già nel select → nessuna modifica funzionale (eventuale ritocco tipo). |

`expires_at` può restare nei `select` e nei tipi esistenti (es. interfaccia `RapportinoStato`
in [`links.ts`](../../../utils/rapportini/links.ts)) — è ancora una colonna valida; semplicemente
non è più letta da `tokenStatus`.

## 9. `genera/route.ts` — scadenza coerente alla nuova regola

- [Riga 39](../../../app/api/mappa/rapportini/genera/route.ts): sostituire
  `const expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();`
  con `const expires = scadenzaIso(piano.data);` (import da `@/utils/rapportini/scadenza`).
- Righe 50 e 56 (`expires_at: expires`) restano invariate.
- **Bonus:** poiché `expires` ora dipende solo da `piano.data`, **rigenerare** un piano è
  **idempotente** (non sposta più la finestra di validità a caso).

## 10. Casi limite

| Caso | Comportamento |
|---|---|
| Link creato in anticipo (ven → lun) | Valido fino a mer 00:00 (il caso che motiva la feature). ✅ |
| Lavori **odierni** | Valido oggi + domani; scade dopodomani 00:00. |
| Lavori passati (`data` vecchia) | Risulta scaduto (corretto). |
| Apertura a cavallo della mezzanotte | Taglio netto alle **00:00 Europe/Rome** (non UTC, non ora server). |
| Giorno di cambio ora legale (mar/ott) | `mezzanotteRomaIso` misura l'offset a mezzogiorno (stabile) → mezzanotte corretta. |
| Rapportino già **inviato** | Resta "Inviato" anche dopo la scadenza. |
| Cambio `data` del piano + rigenera | Scadenza e stato seguono automaticamente la nuova data. |

## 11. Testing (Vitest)

**`utils/rapportini/scadenza.test.ts` (nuovo):**
- `dataInRoma`: istante serale UTC → giorno Roma corretto, su bordo mezzanotte estate **e** inverno.
- `addGiorni`: +1 / +2, cambio mese, attraversamento DST (es. `2026-03-28` +1 = `2026-03-29`).
- `isScaduto`: giorno lavori → valido; +1 → valido; +2 → scaduto; link in anticipo → valido;
  **bordo mezzanotte** (23:00 Roma dell'ultimo giorno valido → valido; 00:00 Roma del giorno dopo → scaduto), estate e inverno.
- `scadenzaIso`: estate (`2026-06-08` → `2026-06-09T22:00:00.000Z`) e inverno (`2026-01-15` → `2026-01-16T23:00:00.000Z`).

**`utils/rapportini/tokenStatus.test.ts` (riscritto sulla nuova firma):**
- "Inviato" vince anche se la data è passata.
- `data` = oggi (Roma) → valido; `data` due giorni fa → scaduto; `data` futura → valido.

**Verifica manuale:** genera un link per lavori di un giorno futuro → il badge resta "In corso"
fino alla mezzanotte del secondo giorno dopo; un link vecchio già nel DB mostra subito lo stato
corretto senza rigenerarlo.

## 12. File coinvolti

| Area | File | Azione |
|---|---|---|
| Logica scadenza (pura) | `utils/rapportini/scadenza.ts` (+ `scadenza.test.ts`) | Create |
| Stato token | `utils/rapportini/tokenStatus.ts` | Modify (firma: `data` invece di `expires_at`) |
| Test stato token | `utils/rapportini/tokenStatus.test.ts` | Modify |
| Lista piano | `app/api/mappa/rapportini/route.ts` | Modify (tipo/passaggio `data`) |
| Riepilogo | `app/api/mappa/rapportini/riepilogo/route.ts` | Modify (cast `{ stato, data }`) |
| Pagina pubblica | `app/api/r/[token]/route.ts` | Modify (minima / tipo) |
| Generazione | `app/api/mappa/rapportini/genera/route.ts` | Modify (`scadenzaIso` al posto di `now + 48h`) |

## 13. Note

- **Nessuna SQL / migrazione** per questa feature.
- `expires_at` resta in DB, popolata coerentemente da `scadenzaIso`, ma **non è più la fonte di
  verità** dello stato — è questo che fa funzionare la regola anche per i link già esistenti.
- Per cambiare la durata in futuro basta toccare la costante `GIORNI_VALIDITA`.
