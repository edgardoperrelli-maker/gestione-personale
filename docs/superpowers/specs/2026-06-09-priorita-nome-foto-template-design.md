# Priorità nome foto configurabile per template

**Data:** 2026-06-09
**Stato:** Design approvato

## Problema

Le foto scaricate (ZIP rapportino + interventi manuali) vengono rinominate con il
formato `<identificativo>_<EtichettaSlot>.<ext>` (es. `12345_FotoContatore.jpg`).
L'identificativo è scelto da una sequenza di fallback **hard-coded**:
PDR → matricola → ODL → indirizzo.

Serve poter decidere questa sequenza **per ogni template**, dato che committenti
diversi usano identificativi diversi (es. ACEA ragiona per ODL, altri per PDR).
La scelta va fatta nel template, accanto alla configurazione foto (obbligatorietà),
appena si abilitano campi foto.

## Obiettivo

Nell'editor template, quando il template ha almeno un campo `tipo='foto'`, mostrare
una card "Priorità nome foto" che permette di costruire una **lista ordinata** degli
identificativi da usare per il nome file. La lista copre tutti i casi:

- **Un solo campo** → identificativo singolo (es. solo ODL)
- **Più campi in ordine** → sequenza di fallback personalizzata
- **Riordino libero** → sequenza dinamica
- **Lista vuota** → fallback al comportamento storico (PDR → matricola → ODL → indirizzo)

La priorità si legge **sempre dal template corrente** (lettura live), non da snapshot:
una sola fonte di verità, e modificarla si applica a tutti gli scarichi futuri,
inclusi i rapportini già generati.

## Architettura

### Dato

Nuovo tipo identificativo in `lib/interventi/manuali/fotoNaming.ts`:

```ts
export type FotoIdCampo = 'pdr' | 'matricola' | 'odl' | 'indirizzo';
```

Nuova costante con le etichette UI (unica fonte di verità per i bottoni dell'editor):

```ts
export const FOTO_ID_CAMPI: { chiave: FotoIdCampo; etichetta: string }[] = [
  { chiave: 'pdr', etichetta: 'PDR' },
  { chiave: 'matricola', etichetta: 'Matricola' },
  { chiave: 'odl', etichetta: 'ODS/ODL' },
  { chiave: 'indirizzo', etichetta: 'Indirizzo' },
];
```

Default di fallback (ordine storico, usato quando la priorità è vuota):

```ts
export const FOTO_ID_PRIORITY_DEFAULT: FotoIdCampo[] = ['pdr', 'matricola', 'odl', 'indirizzo'];
```

### Logica di naming

`identificativoFoto` riceve un secondo parametro opzionale `priority`:

```ts
export function identificativoFoto(
  ids: IdentificativiFoto,
  priority?: FotoIdCampo[] | null,
): string {
  const ordine = (priority && priority.length > 0) ? priority : FOTO_ID_PRIORITY_DEFAULT;
  for (const chiave of ordine) {
    const norm = normalizzaAscii(String(ids[chiave] ?? '').trim());
    if (norm) return norm;
  }
  return 'intervento';
}
```

`nomeFotoFile` propaga il parametro:

```ts
export function nomeFotoFile(
  etichettaSlot: string,
  ids: IdentificativiFoto,
  ext: string,
  priority?: FotoIdCampo[] | null,
): string {
  const id = identificativoFoto(ids, priority);
  const base = normalizzaAscii(etichettaSlot) || 'foto';
  const estensione = String(ext ?? '').trim().replace(/^\./, '').toLowerCase() || 'jpg';
  return `${id}_${base}.${estensione}`;
}
```

Entrambe restano retro-compatibili: chiamate senza `priority` si comportano come oggi
(ordine storico). I test esistenti continuano a passare.

### Persistenza (DB)

Nuova colonna sul template:

```sql
ALTER TABLE rapportino_template
  ADD COLUMN IF NOT EXISTS foto_id_priority jsonb NOT NULL DEFAULT '[]'::jsonb;
```

Nessuna colonna nuova su `rapportini`, nessuno snapshot, nessuna migrazione di dati.
Template esistenti = `[]` = comportamento storico invariato.

> **Nota consegna SQL**: la migration va creata come file in `supabase/migrations/`,
> ma l'esecuzione sul DB di produzione la fa l'utente (il Supabase MCP punta ad altro
> progetto). La SQL viene consegnata in chat solo su richiesta esplicita.

### Validazione (Zod)

In `lib/rapportini/templateSchema.ts`:

```ts
export const FotoIdPrioritySchema = z.array(z.enum(['pdr', 'matricola', 'odl', 'indirizzo'])).default([]);
// dentro TemplateSchema:
foto_id_priority: FotoIdPrioritySchema,
```

### API template (`app/api/admin/rapportino-template/route.ts`)

- `GET`: aggiungere `foto_id_priority` alla `select`.
- `POST`: includere `foto_id_priority: parsed.data.foto_id_priority` nell'insert.
- `PATCH`: aggiungere `'foto_id_priority'` alla lista delle chiavi copiate nel patch.

### Editor template (`TemplateRapportiniClient.tsx`)

- Tipo `Template` estende con `foto_id_priority?: FotoIdCampo[]`.
- Nuovo stato `const [fotoIdPriority, setFotoIdPriority] = useState<FotoIdCampo[]>([])`.
- Integrazione in `loadTemplate` (`setFotoIdPriority(tpl.foto_id_priority ?? [])`),
  `startNew` (`setFotoIdPriority([])`), `handleSave` e nel payload dell'auto-save
  (stessa pipeline di `titolo_campi`, quindi va anche nelle dependency dell'`useEffect`).
- Helper `toggleFotoId` / `moveFotoId` analoghi a `toggleTitolo` / `moveTitolo`.
- Nuova card **"Priorità nome foto"**, renderizzata solo se
  `campi.some((c) => c.tipo === 'foto')`. UI identica alla card "Card nella lista
  interventi": lista ordinata con `▲ ▼` + Rimuovi, bottoni `＋` per i campi non ancora
  scelti (da `FOTO_ID_CAMPI`), testo di fallback quando la lista è vuota
  ("Ordine predefinito: PDR → Matricola → ODS/ODL → Indirizzo"), e una riga di
  anteprima dal vivo del nome file risultante (es. `12345_FotoContatore.jpg`).

### Punto di consumo 1 — Intervento manuale (`app/api/r/[token]/intervento-manuale/route.ts`)

Il template viene già caricato live. Aggiungere `foto_id_priority` alla `select` dei
template (e al tipo `TemplateRow` in `risolviTemplateCommittente.ts`), poi leggere
`templateRow.foto_id_priority` e passarlo a entrambe le chiamate che generano nomi:

- `identificativoFoto(ids, priority)` per lo `storagePath`
- `nomeFotoFile(c.etichetta, ids, ext, priority)` per il `fileName`

### Punto di consumo 2 — ZIP foto (`app/api/admin/rapportini/[rapportinoId]/foto-zip/route.ts`)

- Aggiungere `template_id` alla `select` del rapportino.
- Se `template_id` presente, una query
  `rapportino_template.select('foto_id_priority').eq('id', template_id)` → `priority`.
- Se il template è assente/cancellato → `priority = []` → fallback al default.
- Passare `priority` a `nomeFotoFile(campo.etichetta, ids, ext, priority)`.

## Data flow

```
Admin configura "Priorità nome foto" nel template
      │  (lista ordinata di FotoIdCampo, salvata in rapportino_template.foto_id_priority)
      ▼
┌─────────────────────────────┐     ┌──────────────────────────────┐
│ Intervento manuale (upload) │     │ ZIP foto (download admin)    │
│ legge templateRow.foto_id…  │     │ legge template via template_id│
└──────────────┬──────────────┘     └───────────────┬──────────────┘
               ▼                                     ▼
        nomeFotoFile(etichetta, ids, ext, priority)
               ▼
        <identificativo>_<EtichettaSlot>.<ext>
```

## Error handling

- `priority` mancante, vuota o `null` → `FOTO_ID_PRIORITY_DEFAULT` (ordine storico).
- Tutti gli identificativi vuoti → `'intervento'` (invariato).
- Template cancellato (solo ZIP) → fallback default, lo ZIP si genera comunque.
- Chiavi sconosciute in `foto_id_priority` → bloccate dallo Zod enum in scrittura;
  in lettura, una chiave non presente in `IdentificativiFoto` dà valore vuoto e si
  passa alla successiva (nessun crash).

## Testing

`lib/interventi/manuali/fotoNaming.test.ts` — nuovi casi per `identificativoFoto` e
`nomeFotoFile` con `priority`:

- priority `['odl']` con PDR presente → usa ODL (ignora PDR)
- priority `['odl','pdr']`, ODL vuoto → fallback a PDR
- priority `[]` → comportamento default (ordine storico) — i casi esistenti restano validi
- priority `['indirizzo']` → usa l'indirizzo normalizzato
- priority con identificativi tutti vuoti → `'intervento'`

## Fuori scope (YAGNI)

- Nessuno snapshot della priorità nei rapportini (lettura live, decisione esplicita).
- Nessuna modifica a `sincronizzaRapportini.ts`.
- Nessun cambiamento al formato `<id>_<etichetta>` (già deciso nella modifica precedente).
- Nessuna priorità per-campo-foto (la priorità è a livello template, non di singolo slot).
