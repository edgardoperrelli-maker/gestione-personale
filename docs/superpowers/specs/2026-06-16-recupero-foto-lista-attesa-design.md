# Recupero foto in Lista attesa (Parte C) — design

Data: 2026-06-16
Stato: design approvato (durante il brainstorming) → spec di dettaglio

## Problema

Le ~26 richieste manuali "+" `lim_massive` rimaste senza foto (incidente del 15/06)
vanno completate: l'ufficio ha ricevuto le foto dagli operatori e deve poterle
**allegare a mano** alla richiesta dal backoffice (Lista attesa), così le richieste
tornano complete e il flusso non ha buchi.

## Obiettivo

Dare al backoffice un modo per **caricare foto a una richiesta manuale**, **per-slot**
(ogni foto al suo slot del template), su **tutte le richieste** (in attesa e già approvate).
Le foto caricate vanno in `interventi_manuali_foto` (come le foto operatore) → compaiono
nel pannello di revisione e nei download foto del backoffice.

## Design

### API — `POST /api/admin/interventi-manuali/[id]/foto`

Si aggiunge la POST al file che già espone la GET.

- `requireAdmin`.
- Legge la richiesta (`id, committente, template_id`).
- `received = partiFotoRicevute(form)` (riusa l'helper della Parte A: parti `foto:<slot>`).
- Se nessuna foto → 400 `nessuna_foto`.
- Risolve le etichette degli slot dal template della richiesta (`template_id` → `campi`),
  con `etichettaSlotFoto(chiave, campi)` (riuso Parte A; fallback alla chiave).
- Per ogni foto ricevuta, **sostituzione per-slot** (una foto per slot):
  1. trova le righe `interventi_manuali_foto` esistenti per `(richiesta_id=id, slot_chiave=chiave)`;
  2. rimuove i relativi file da storage + cancella le righe;
  3. carica il nuovo file in `interventi-foto` con path `"<id>/<chiave>_<uuid>.<ext>"`;
  4. inserisce la riga `interventi_manuali_foto` (slot_chiave, slot_etichetta, storage_path,
     file_name, mime_type, size).
- Check MIME (solo `image/*`).
- Funziona su **qualsiasi stato** della richiesta (nessun controllo su `stato`).
- Risposta: `{ ok: true, count }`.

### Componente riutilizzabile — `CaricaFotoRichiesta`

`components/modules/lista-attesa/CaricaFotoRichiesta.tsx` (client).

- Props: `{ richiestaId: string; slotFoto: TemplateCampo[]; onCaricato: () => void }`.
- Stato locale: file per slot (`Record<string, File>`), `inviando`, `errore`.
- Rende un `CampoFoto` per ciascuno slot (riuso del componente operatore: anteprima,
  compressione client, pulsante "Libreria" per scegliere il file da disco).
- Pulsante **Carica**: costruisce `FormData` con `foto:<slot>` per ogni file scelto →
  `POST /api/admin/interventi-manuali/<id>/foto` → al successo svuota i file scelti e
  chiama `onCaricato()` (il genitore ricarica le foto).
- Se `slotFoto` è vuoto: messaggio "Nessuno slot foto per questo committente".

### UI — richieste in attesa (pannello di revisione)

In `PannelloRevisioneRichiesta`:
- Si estrae la fetch delle foto in una funzione `caricaFoto()` richiamabile (oggi è inline
  nello useEffect).
- Si aggiunge `<CaricaFotoRichiesta richiestaId={riga.id} slotFoto={campiFoto(campiEsito)}
  onCaricato={caricaFoto} />` sotto la galleria foto, così l'ufficio carica e vede subito.

### UI — richieste già approvate (registro)

In `RegistroAutorizzazioni`:
- Nuova colonna con pulsante **"📷 Foto"** per riga; un click espande una riga di dettaglio
  (`<tr>` con `colSpan`) che mostra le foto già presenti (GET) + `CaricaFotoRichiesta`.
- Gli slot foto del committente arrivano da un nuovo prop `campiPerCommittente`
  (`Partial<Record<CommittenteManuale, TemplateCampo[]>>`), passato dalla pagina
  (`app/hub/lista-attesa/page.tsx` lo calcola già per la coda).
- `slotFoto = campiFoto(campiPerCommittente[r.committente] ?? [])`.

## Componenti e modifiche

- **Modifica:** `app/api/admin/interventi-manuali/[id]/foto/route.ts` — aggiunge `POST`.
- **Crea:** `components/modules/lista-attesa/CaricaFotoRichiesta.tsx`.
- **Modifica:** `components/modules/lista-attesa/PannelloRevisioneRichiesta.tsx` — `caricaFoto()` + uploader.
- **Modifica:** `components/modules/lista-attesa/RegistroAutorizzazioni.tsx` — colonna/riga espandibile + prop `campiPerCommittente`.
- **Modifica:** `app/hub/lista-attesa/page.tsx` — passa `campiPerCommittente` a `RegistroAutorizzazioni`.
- Riuso: `CampoFoto`, `partiFotoRicevute`, `etichettaSlotFoto`, `campiFoto`. Nessuna migration.

## Gestione errori

- Upload storage fallito → 502; riga non inserita.
- MIME non immagine → 400.
- Nessuna foto in FormData → 400 `nessuna_foto`.
- La sostituzione per-slot è best-effort sequenziale; un errore su uno slot interrompe e
  ritorna errore (gli slot già caricati restano: il backoffice può ripetere — idempotente
  per slot grazie alla sostituzione).

## Testing

- L'API e i componenti sono I/O/UI: verifica con lint + typecheck mirati + suite esistente.
- Gli helper riusati (`partiFotoRicevute`, `etichettaSlotFoto`) sono già testati (Parte A).
- Verifica funzionale post-deploy: caricare una foto per slot su una richiesta (in attesa e
  approvata) → compare in `interventi_manuali_foto` e nel pannello/registro; query read-only:

```sql
select richiesta_id, slot_chiave, slot_etichetta from interventi_manuali_foto
where richiesta_id = '<id>' order by created_at;
```

## Fuori scope

- Backfill automatico: il caricamento è manuale, una richiesta alla volta (è il recupero).
- Riconciliazione con gli interventi già approvati (le foto in `interventi_manuali_foto`
  sono già lette dal backoffice/foto-zip; non serve toccare l'intervento).
