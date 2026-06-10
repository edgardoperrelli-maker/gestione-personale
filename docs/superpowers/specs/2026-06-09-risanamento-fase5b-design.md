# Risanamento colonne — Fase 5b: PDF riepilogo + ZIP foto

**Data:** 2026-06-09
**Stato:** Design approvato
**Progetto:** Flusso "Risanamento colonne" (multi-fase). Questo documento copre **solo la Fase 5b** (ultima).

---

## Contesto

La 5a ha dato la chiusura (validazione + punti gas + archivio). La 5b chiude il progetto con **due** consegne, che
seguono **lo stesso flusso dei rapportini standard** (nessuna foto nel PDF):

1. **PDF riepilogo** generato dall'operatore sul telefono e condiviso su WhatsApp (come oggi i link normali),
   **senza foto** — civici + misuratori + totale punti gas.
2. **ZIP foto** scaricabile da web (admin), **esteso** per includere anche le foto delle righe-misuratore
   (oggi lo ZIP copre solo le foto a livello voce, non quelle delle righe).

Le foto NON vanno mai dentro il PDF: il PDF è leggero e condivisibile su WhatsApp; le foto si scaricano a parte da web.

---

## Sezione A — PDF riepilogo (lato client, come lo standard)

### A1. Helper dati (puro, testabile) — `utils/rapportini/datiPdfRisanamento.ts`
`datiPdfRisanamento(voci, righe)`: raggruppa le righe per civico (voce) e produce:
```
{
  civici: Array<{
    via: string; comune: string;
    misuratori: Array<{ matricola: string; pdr: string; nominativo: string }>;
  }>;
  totaleMisuratori: number;   // = righe.length (punti gas)
  totaleCivici: number;
}
```
Ordina i civici come le voci e i misuratori per `ordine`. Nessuna foto.

### A2. Generatore PDF — `utils/rapportini/pdfRisanamento.ts`
`generaPdfRisanamentoBlob(dati, meta): Promise<Blob>` con `meta = { staffName, dataLabel }`. Usa `jsPDF` (import
dinamico) + `jspdf-autotable`, rubando lo stile da `rapportinoPdf.ts` (header Plenzich, font, colori brand):
- Intestazione: "RAPPORTINO RISANAMENTO" · operatore · data.
- Box totali: "N punti gas · M civici".
- Per ogni civico: banda con via/comune, poi una tabella `autoTable` dei misuratori (colonne: # · Matricola · PDR · Nominativo).
- Footer "Generato il … · Pagina X di N" (come standard).
- Ritorna `doc.output('blob')`.
- `nomeFilePdfRisanamento(staffName, dataIso)` → `Risanamento_<STAFF>_<AAAA-MM-GG>.pdf` (stessa normalizzazione di `nomeFilePdf`).

### A3. Trigger client — bottone in `RisanamentoView`
Quando `inviato` (rapportino chiuso), mostra un bottone **"Condividi PDF"** accanto al banner "Rapportino inviato".
Al click: `generaPdfRisanamentoBlob(datiPdfRisanamento(voci, righe), { staffName, dataLabel })` →
`condividiOScarica({ blob, filename, title, text })` (utility esistente: Web Share API / download). Stesso identico
flusso del `CondividiPdfButton` standard. Disponibile anche se il rapportino era già inviato (`readOnly`).

## Sezione B — ZIP foto esteso (lato web/admin)

Estendere `GET /api/admin/rapportini/[rapportinoId]/foto-zip` con una **Fonte C**: le foto delle righe-misuratore.
Dopo la Fonte B (foto voci), se ci sono campi foto:
- Carica `rapportino_righe` (`id, voce_id, matricola, pdr, nominativo, risposte, ordine`) del rapportino.
- Per ogni riga e ogni campo `tipo='foto'` con `scope_foto='misuratore'` (le foto prima/dopo), se
  `riga.risposte[campo.chiave]` è un path valido, aggiungi una `FotoZip` con `richiesta_id = riga.id` e
  `file_name = nomeFotoFile(campo.etichetta, { matricola: riga.matricola, pdr: riga.pdr }, ext, fotoPriority)`.
- Le foto fase/accessoria del civico restano coperte dalla Fonte B (sono in `voce.risposte`).
- Il resto (collisioni via `buildZipEntries`, download, Response) invariato.

## Data flow

```
[Operatore, dopo invio] "Condividi PDF" → datiPdfRisanamento(voci,righe) → generaPdfRisanamentoBlob → condividiOScarica (WhatsApp/download)
[Admin, da web]         "Scarica foto ZIP" → foto-zip (Fonte A manuali + B voci + C righe-misuratore) → .zip
```

## Error handling

- PDF: generazione interamente client da dati già in memoria (voci/righe) → nessuna rete; se `jsPDF` fallisce, messaggio d'errore e nessun download.
- ZIP: invariato (foto mancanti saltate, `X-Skipped-Photos`); la Fonte C salta i path vuoti.

## Testing

- Unit: `datiPdfRisanamento` (raggruppa per civico, ordina, totali; rapportino senza righe → civici vuoti, totale 0).
- Unit: `nomeFilePdfRisanamento` (normalizzazione).
- PDF reale e ZIP esteso: `tsc`/`eslint`/`build`; verifica visiva con dati reali dopo le migration (il generatore PDF e l'estensione ZIP non hanno logica di rete testabile in locale oltre agli helper).

## Fuori scope

- Foto dentro il PDF (esplicitamente escluse: il PDF è leggero, le foto si scaricano da web).
- PDF lato admin/server (il PDF è del flusso operatore, come i link standard).
- Nessuna modifica al flusso standard.

## Stato progetto dopo la 5b

Con la 5b il flusso "Risanamento colonne" è **completo** (Fasi 1→5b). Resta solo il deploy: migration accumulate da
lanciare, rebase su origin con reintegro tile "Estrazione misuratori", `npm install` (per `@zxing/browser`), push con OK.
