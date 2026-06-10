# Foto multiple per campo (risanamento)

**Data:** 2026-06-10
**Stato:** Design approvato

---

## Contesto

Nel template risanamento i campi foto hanno uno `scope_foto` (misuratore / fase / accessoria), che genera le 3
sezioni della UI operatore. Oggi ogni campo foto = **una** foto (`risposte[chiave]` = un path). Serve permettere
**più foto** sui campi di sezione **fase** e **accessoria** (es. più foto di resina), mantenendo **una sola** foto
sui campi **misuratore** (prima/dopo).

## Regola (scope-based)

- `scope_foto === 'misuratore'` → **1 foto** (come oggi).
- `scope_foto === 'fase'` o `'accessoria'` → **N foto** (illimitate; l'operatore aggiunge/rimuove).

Nessuna nuova impostazione nel template: la multiplicità è implicita nello scope. I template **standard** (campi foto
senza scope → trattati come misuratore) restano invariati.

## Modello dati

`risposte[chiave]` diventa `string | string[]`:
- campi misuratore → `string` (un path), come oggi;
- campi fase/accessoria → `string[]` (lista di path).

Retrocompatibile: una vecchia foto singola (`string`) viene letta come lista di 1. Helper di normalizzazione
`comeArrayFoto(v): string[]` (string non vuota → `[v]`; array → filtra le stringhe non vuote; altro → `[]`).

## Componenti

### 1. Helper `utils/rapportini/comeArrayFoto.ts` (puro, testabile)
`comeArrayFoto(v: unknown): string[]` — normalizza `string | string[] | null | undefined` in `string[]` (solo path non vuoti).

### 2. `GalleriaFoto` (nuovo componente UI) — `components/modules/rapportini/risanamento/GalleriaFoto.tsx`
Per i campi multipli. Mostra:
- le miniature/righe dei path già caricati, ciascuna con una **✕** per rimuoverla;
- i bottoni "📷 Scatta" / "🖼️ Libreria" che **aggiungono** una foto (comprimi → `foto-campo` → append);
- un conteggio ("N foto") e l'etichetta (con `*` se obbligatoria).
Props: `{ token, etichetta, valori: string[], obbligatoria?, disabilitato?, onAdd: (path) => void, onRemove: (path) => void }`.
Riusa `comprimiImmagine` e l'endpoint `foto-campo` (come `SlotFoto`).

### 3. `RisanamentoView` — sezioni Fasi/Accessorie
- Le sezioni **Fasi** e **Accessorie** usano `GalleriaFoto` (multi) invece di `SlotFoto` (single).
- I **Misuratori** restano con `SlotFoto` (single), invariati.
- Lettura valori: `comeArrayFoto(risposteVoce[campo.chiave])`.
- `aggiungiFotoVoce(chiave, path)`: append → `POST /voce` con `risposte[chiave] = nuovoArray`; aggiorna `vociRisposte`.
- `rimuoviFotoVoce(chiave, path)`: filtra → `POST /voce` con l'array aggiornato. La foto resta nello storage (non referenziata) — accettabile.

### 4. Validazione chiusura — `righeIncomplete`
Sostituire `fotoPresente(risposte, chiave)` con `comeArrayFoto(risposte[chiave]).length > 0` (vale sia per misuratore
singola sia per fase multipla). Misuratore obbligatorio = almeno la sua foto; fase obbligatoria = almeno 1 foto.

### 5. ZIP foto — `foto-zip/route.ts`
Fonte B (voci) e Fonte C (righe): dove oggi si legge un singolo path, usare `comeArrayFoto(risposte[chiave])` e
generare **una entry per path**. Se il campo ha >1 foto, aggiungere un **indice** al nome
(`nomeFotoFile(etichetta, ids, ext, priority)` → inserire ` _N` prima dell'estensione, oppure passare un suffisso).
I campi a foto singola restano col nome attuale (nessun indice).

### 6. Editor template — anteprima
In `TemplateRapportiniClient.tsx`, nell'"Anteprima sezioni foto", accanto ai campi delle sezioni fase/accessoria
mostrare l'indicazione "(più foto)" per chiarire che accettano più scatti. Nessun'altra modifica all'editor.

## Data flow

```
Operatore (sezione Fase/Accessoria) → GalleriaFoto
  + Aggiungi → comprimi → foto-campo (path) → append a risposteVoce[chiave] → POST /voce {risposte:{chiave:[...]}}
  ✕ Rimuovi → filtra path → POST /voce {risposte:{chiave:[...]}}
Chiusura → righeIncomplete: fase obbligatoria → comeArrayFoto(...).length > 0
Admin ZIP → foto-zip: per ogni path in comeArrayFoto(...) una entry (indice se >1)
```

## Error handling

- Upload di una singola foto fallito → messaggio inline; le altre già caricate restano.
- `risposte[chiave]` legacy come stringa → `comeArrayFoto` lo gestisce (lista di 1).
- Rimozione: aggiorna solo il riferimento; nessuna cancellazione da storage (deposito, non critico).

## Testing

- Unit: `comeArrayFoto` (string → [path]; array → filtra vuoti; null/'' → []; mix).
- Unit: `righeIncomplete` con foto multiple (fase obbligatoria vuota → incompleto; con 1+ → ok; misuratore invariato).
- UI `GalleriaFoto` / ZIP indicizzato: verifica `tsc`/`eslint`/`build`; comportamento reale sul campo (fotocamera).

## Fuori scope (YAGNI)

- Nessun tetto massimo di foto (illimitate).
- Nessun toggle per-campo (la regola è solo scope-based).
- Niente foto multiple sui misuratori (prima/dopo restano singole).
- Il PDF riepilogo (5b) non contiene foto → non toccato.
- Riordino delle foto nella galleria (non richiesto).
