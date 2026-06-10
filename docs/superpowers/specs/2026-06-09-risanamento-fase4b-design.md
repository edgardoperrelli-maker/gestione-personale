# Risanamento colonne — Fase 4b: Scanner barcode/QR + lookup

**Data:** 2026-06-09
**Stato:** Design approvato
**Progetto:** Flusso "Risanamento colonne" (multi-fase). Questo documento copre **solo la Fase 4b**.

---

## Contesto

La Fase 4a ha dato la UI operatore con righe-misuratore aggiunte a mano. La 4b aggiunge lo **scanner**:
l'operatore inquadra il barcode/QR del misuratore, il sistema cerca la **matricola** nell'estrazione
(`risanamento_misuratori_ref`) e crea la riga **auto-compilando** PDR/nominativo. Una **barra di ricerca**
scanner ritrova le righe già create per la fase "dopo".

Device misti (iOS + Android) → libreria cross-browser **`@zxing/browser`** (decodifica barcode 1D + QR
da fotocamera; `BarcodeDetector` nativo non c'è su Safari iOS).

---

## Sezione 1 — Libreria + componente scanner

- Dipendenza nuova: `@zxing/browser` (+ `@zxing/library` come peer, se richiesta).
- `components/modules/rapportini/risanamento/ScannerMisuratore.tsx`: overlay a tutto schermo che apre la
  fotocamera (preferendo quella posteriore), decodifica in continuo con `BrowserMultiFormatReader`; al primo
  codice valido → callback `onCodice(testo)` e chiude. Bottone "Annulla". Gestione errori: permesso negato /
  nessuna fotocamera → messaggio chiaro + chiusura. Cleanup dello stream alla chiusura/unmount.

## Sezione 2 — Helper match indirizzo (puro, testabile)

`utils/rapportini/matchIndirizzo.ts`:
- `normalizzaIndirizzo(s)`: lowercase, rimozione accenti/punteggiatura/spazi multipli → stringa canonica.
- `stessoCivico(viaVoce, indirizzoRef)`: true se gli indirizzi normalizzati combaciano (uguaglianza dopo
  normalizzazione; contiene-l'uno-l'altro per tollerare "Via Roma" vs "Via Roma 12"). Usato per decidere
  `fonte: 'civico'` vs `'fuori_elenco'`.

## Sezione 3 — Endpoint lookup

`GET /api/r/[token]/lookup-misuratore?voceId=&codice=` (guard token come gli altri `/r/[token]`):
- Carica la voce (via/comune) per `voceId` (verifica appartenenza al rapportino).
- Cerca `codice` come `matricola` in `risanamento_misuratori_ref` (eq, prendi i match).
- Nessun match → `{ trovato: false }`.
- Almeno un match: scegli il match il cui `indirizzo` fa `stessoCivico` con la `via` della voce; se esiste →
  `{ trovato: true, fonte: 'civico', ref_id, pdr, nominativo }`. Altrimenti (match con indirizzo diverso) →
  `{ trovato: true, fonte: 'fuori_elenco', ref_id, pdr, nominativo, indirizzoRef }`.

## Sezione 4 — Estensione endpoint /riga

`POST /api/r/[token]/riga` (Fase 4a) — l'INSERT accetta ora anche `fonte` (`'civico'|'fuori_elenco'|'manuale'`,
default `'manuale'`) e `ref_id` (bigint|null), così le righe da scan tracciano l'origine. Lo UPDATE resta invariato.

## Sezione 5 — Integrazione UI (in RisanamentoView)

- **Crea da scan**: nella sezione Misuratori, bottone **"📷 Scansiona"** → `ScannerMisuratore` → `codice` →
  `GET lookup-misuratore` →
  - `civico`/`fuori_elenco`: `POST /riga` con `{ voceId, matricola: codice, pdr, nominativo, fonte, ref_id }`;
    append della riga. `fuori_elenco` mostra un badge/avviso "fuori elenco".
  - `trovato:false`: precompila il form manuale con `matricola = codice` (l'operatore completa e salva → `fonte='manuale'`).
- **Cerca "dopo"**: bottone **"🔍 Cerca (scan)"** → `ScannerMisuratore` → `codice` → cerca tra le `righe` del
  civico in stato (per `matricola === codice`) → se trovata, evidenziala/scrolla (così l'operatore carica la
  foto "dopo"); se non trovata, avviso "non presente — scansiona da “Scansiona” per crearla".

## Data flow

```
[+ Scansiona] → ScannerMisuratore (zxing) → codice → GET lookup-misuratore
   trovato(civico|fuori_elenco) → POST /riga {matricola,pdr,nominativo,fonte,ref_id} → riga auto-compilata
   trovato=false → form manuale precompilato (matricola) → POST /riga {fonte:'manuale'}
[🔍 Cerca] → ScannerMisuratore → codice → match riga locale per matricola → evidenzia (fase "dopo")
```

## Error handling

- Permesso fotocamera negato / device senza camera → `ScannerMisuratore` mostra messaggio e si chiude (l'operatore può sempre usare il form manuale 4a).
- `codice` vuoto/illeggibile → lo scanner continua finché non legge o l'operatore annulla.
- Lookup: matricola non in estrazione → `trovato:false` → form manuale.
- Matricola duplicata in estrazione → si prende il match `civico` se presente, altrimenti il primo (la distinzione fine è demandata all'admin che ripulisce l'estrazione, Fase raffinamento).

## Testing

- Unit: `normalizzaIndirizzo` / `stessoCivico` (case/accenti/punteggiatura, "Via Roma" vs "Via Roma 12").
- Unit: helper di scelta match nel lookup (dato un set di ref + via voce → fonte/ref_id) se isolato.
- Scanner (`@zxing`) e UI: verifica `tsc`/`eslint`/`build`; la decodifica reale si prova **sul campo** (serve fotocamera).

## Fuori scope (YAGNI / Fase 5)

- Chiusura (conteggio punti gas + conferma, vincolo doppia foto), spostamento in archivio, PDF.
- Nessuna modifica al flusso standard né alla 4a (lo scanner è additivo: il form manuale resta).
