# Assegnazione AI — Redesign modulo (anteprima raggruppata + dettaglio riga) — Design

**Data:** 2026-06-18 · **Modulo:** `/hub/assegnazione-ai` (admin) · **Stato:** design approvato (mockup).

## Obiettivo
Il modulo è troppo piatto/povero di info. Renderlo **ordinato e informativo**: riepilogo a colpo d'occhio, **anteprima raggruppata per operatore** (= per rapportino) con **stato/conflitti mostrati PRIMA di Procedi**, **dettaglio riga-per-riga** espandibile, barra azione esplicita, storico più leggibile. Skin = design system esistente (Aurea dark/light, token `--brand-*`/`--kpi-*`/`--success|warning|danger`).

## Comportamento

### 1. Riepilogo lettura (4 metric tile)
Righe lette · Operatori (con quanti *da risolvere*) · Comuni · Interventi. Derivati client-side dalle righe caricate.

### 2. Anteprima raggruppata (centro del redesign)
- Raggruppa le righe per **Comune → Operatore**. Un blocco per operatore = un futuro rapportino.
- Per ogni operatore: avatar iniziali, nome, **n. interventi**, **stato**:
  - `libero` (verde/success) — sarà pianificato.
  - `conflitto` (oro/warning) — già pianificato in quel comune+giorno → **escluso** (badge "già pianificato GG/MM"); checkbox disabilitata.
  - `non_risolto`/`ambiguo` (magenta/danger) — esecutore non mappato a `staff` → escluso, con motivo.
- **Selezione**: checkbox per-riga (come oggi, default tutte selezionate tranne conflitto/non_risolto), + select-all per-operatore + per-comune. "Procedi" invia gli `ids` selezionati (endpoint `assegna` invariato).
- **Dettaglio riga-per-riga**: ogni blocco operatore è **espandibile** → mostra la tabella dei suoi interventi (ODL, matricola, indirizzo, data, gruppo attività, committente) con la checkbox per riga. Chiuso di default; "▸ N interventi" per aprire.
- Banner in cima all'anteprima che riassume i conflitti rilevati (es. "PASTORELLI già pianificato il 19/06 → escluso").

### 3. Barra azione
Riga sticky/in coda all'anteprima: "N operatori liberi · M interventi → crea X piani, Y rapportini" + bottone **Procedi** (glow cyan). Dopo Procedi: esito ricco (piani/rapportini creati = success; conflitti = warning; non risolti/avvisi).

### 4. Storico
Lista compatta (Giorno · Comune · Operatore · N. interventi · Creato il), come ora ma più leggibile; banner "già assegnato" sul giorno selezionato (già esistente).

## Architettura (riuso, niente logica duplicata)

### Helper puro `lib/agente/costruisciAnteprima.ts` (+test)
Trasforma le righe caricate nella struttura dell'anteprima, **riusando** `risolviEsecutore` e `partizionaConflitti`. Riceve gli `esistenti` (rapportini) già caricati → puro/testabile.

```ts
import { risolviEsecutore } from '@/lib/agente/risolviEsecutore';
import { partizionaConflitti } from '@/lib/agente/partizionaConflitti';
import type { RapEsistente } from '@/utils/rapportini/rilevaConflitti';

export type RigaP = { id: string; file: string; odl: string | null; matricola: string | null; indirizzo: string | null; comune: string | null; data: string; esecutore: string | null };
export type StatoOp = 'libero' | 'conflitto' | 'non_risolto' | 'ambiguo';
export type OperatoreAnteprima = { key: string; staffId: string | null; nome: string; stato: StatoOp; submitted: boolean; righe: RigaP[] };
export type GruppoAnteprima = { comune: string; data: string; operatori: OperatoreAnteprima[] };

export function costruisciAnteprima(args: {
  righe: RigaP[];
  staff: { id: string; display_name: string }[];
  esistentiPerData: Record<string, RapEsistente[]>; // data 'YYYY-MM-DD' → rapportini esistenti
}): GruppoAnteprima[];
```

Logica: (a) per ogni riga risolvi l'esecutore; (b) raggruppa per `data|comune` poi per operatore (staffId per i risolti, key sintetica `nonrisolto|<esecutore>` per i non risolti); (c) per ogni gruppo (data,comune) chiama `partizionaConflitti` sui SOLI operatori risolti con `esistentiPerData[data]` → marca `conflitto`; gli altri risolti = `libero`; i non risolti = `non_risolto`/`ambiguo`. Ordina: liberi prima, poi conflitti, poi non risolti.

### Endpoint `POST /api/admin/agente/anteprima` `{ ids: string[] }`
`requireAdmin`. Carica le righe selezionate (`agente_pianificabili`) + `staff` + per ogni `data` distinta `caricaRapportiniEsistenti(db, data, staffIds)` → `costruisciAnteprima` → `{ gruppi: GruppoAnteprima[] }`. Nessuna scrittura.

### UI `components/modules/assegnazione-ai/AssegnazioneAiClient.tsx` (riscrittura)
Mantiene: date-picker + "Leggi dal file", la selezione `ids` per "Procedi" (endpoint `assegna` invariato), lo storico (fetch `/assegnazioni`). Aggiunge: fetch `/anteprima` (su mount/refresh con gli id caricati) → render riepilogo + gruppi + dettaglio espandibile + barra azione. Stato selezione client (Set di id) inizializzato con le sole righe **libere** (conflitto/non_risolto escluse). Skin coi token esistenti; stati→`--success/--warning/--danger`; tile→`--brand-surface`/bordo; Procedi→`--brand-primary` + `--shadow-hover`.

## Fuori scope (YAGNI)
- Spostare la selezione interamente a livello operatore (resta per-riga + select-all).
- Filtri/ricerca nell'anteprima.
- Modifica dell'endpoint `assegna` (il pre-check conflitti server resta la rete di sicurezza autorevole).

## Test
- `costruisciAnteprima`: risolto+nessun conflitto → `libero`; risolto già pianificato (esistenti) → `conflitto`; esecutore non in staff → `non_risolto`; raggruppamento per comune/operatore corretto; righe attaccate all'operatore giusto; ordinamento liberi→conflitti→non_risolti.
