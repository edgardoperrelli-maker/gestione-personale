# Affidabilità foto richiesta manuale — Parte A (reliability)

Data: 2026-06-16
Stato: design approvato (in attesa di review della spec)

## Problema (cosa è successo)

Il 15/06 dalle ~14:12 in poi, le richieste manuali "+" (committente `lim_massive`)
sono andate in approvazione **senza foto**. ~26 richieste colpite, foto non più
presenti sul server (verificato: assenti da `interventi_manuali_foto`, dallo
storage sotto `<richiestaId>/`, e dalle risposte delle voci).

### Causa radice (confermata in produzione)

Client e server risolvono gli **slot foto** del "+" in modo **diverso**:

- **Client** ([ModaleInterventoManuale.tsx](../../../components/modules/rapportini/ModaleInterventoManuale.tsx) righe 70-74):
  `campiEsito = override (template solo_manuale) se valorizzato, altrimenti campiStandard`
  dove `campiStandard` = campi del template del rapportino (`rap.template_id`), letti **live**
  ([app/r/[token]/page.tsx:185](../../../app/r/%5Btoken%5D/page.tsx)).
  → quando il template manuale `lim_massive` è stato svuotato, il client ha fatto
  **fallback allo standard** (che ha gli slot foto) → l'operatore ha allegato e inviato le foto.
- **Server** ([intervento-manuale/route.ts:80](../../../app/api/r/%5Btoken%5D/intervento-manuale/route.ts)):
  `slotFoto = campiFoto(template_solo_manuale.campi)` — **nessun fallback**.
  Con il template manuale vuoto, `slotFoto = []` → la route **non legge** le parti
  `foto:*` e le **scarta silenziosamente**.

Quindi le foto sono state realmente inviate dall'operatore e buttate via dal server,
senza alcun errore. Una perdita dati silenziosa: è questo il difetto di affidabilità da chiudere.

## Obiettivo

**Mai perdere una foto inviata da un operatore.** Una foto ricevuta dal server deve
sempre essere salvata, qualunque sia lo stato di configurazione dei template.

## Modello template (requisito di prodotto)

Lo **standard comanda**, il **manuale è override**:
- Lo standard = template del rapportino (`rap.template_id`), letto live.
- Il manuale (`solo_manuale`) sovrascrive solo se valorizzato; se vuoto **eredita lo standard**.
- Modifico lo standard → cambia anche il "+"; modifico il manuale → override, cambia solo quello.

Il client implementa già questo modello. Il server deve allinearsi.

## Design — due livelli di difesa (defense-in-depth)

### Livello 1 — Eredità lato server (prevenzione)

La route `intervento-manuale` risolve i campi del "+" con la **stessa eredità del client**:

```
effectiveCampi = override.campi (template solo_manuale del committente) se non vuoto
                 altrimenti standardCampi (campi del template del rapportino, live)
```

Per ottenere `standardCampi` la route carica i `campi` del template del rapportino
(`rap.template_id`); se assente, ricade sullo snapshot del rapportino.
`slotFoto` e la validazione delle obbligatorie usano `effectiveCampi`.

Effetto: un template manuale vuoto/sballato **eredita lo standard** → gli slot foto
ci sono sempre → le foto vengono riconosciute e salvate.

### Livello 2 — Mai scartare (rete di sicurezza finale)

Indipendentemente dai template, la route persiste **ogni** parte `foto:*` ricevuta:

- Si itera su **tutte** le parti `foto:<chiave>` della FormData (non solo gli slot del template).
- Ogni file immagine non vuoto viene caricato nello storage e inserito in
  `interventi_manuali_foto`, con:
  - `slot_chiave` = la chiave ricevuta;
  - `slot_etichetta` = etichetta dello slot in `effectiveCampi` se la chiave combacia,
    altrimenti la chiave stessa (fallback leggibile);
  - `storage_path` = `<richiestaId>/<chiave>_<identificativo>.<ext>` (invariato).
- Resta il check MIME (solo `image/*`) e il pattern "carica tutto in storage → poi INSERT DB →
  rollback storage se qualcosa fallisce" già presente.

Effetto: anche se per qualunque motivo una chiave foto non è nei template, il file
**non viene perso** — viene comunque salvato e collegato alla richiesta.

### Validazione foto obbligatorie

Resta basata su `effectiveCampi`: gli slot `tipo==='foto'` con `obbligatoria===true`
devono essere presenti tra le parti ricevute (il "+" è sempre a esito positivo, quindi
la validazione si applica sempre). Mancano → 422 con l'elenco etichette, come oggi.

## Componenti e modifiche

- **`app/api/r/[token]/intervento-manuale/route.ts`** (I/O):
  - Caricare `rap.template_id` e i `campi` del relativo template (lo standard live).
  - Calcolare `effectiveCampi` via eredità.
  - Iterare su **tutte** le parti `foto:*` ricevute (non solo `slotFoto`).
  - Persistere ogni foto (storage + DB) con etichetta risolta o di fallback.
  - Mantenere check MIME, upload-prima-di-insert e rollback.
- **Nuovi helper puri (con test, `vitest`):**
  - `risolviCampiManuali(override, standard)` → ritorna `override` se non vuoto, altrimenti `standard`.
  - `partiFotoRicevute(form)` → estrae le coppie `{ chiave, file }` da tutte le parti `foto:*`
    (file immagine, size > 0).
  - `etichettaSlotFoto(chiave, campi)` → etichetta del campo foto se la chiave combacia,
    altrimenti la chiave (fallback).
- Nessuna modifica al client in questa Parte A (il client è già corretto). Nessuna migration.

## Flusso dati (route, nuovo)

1. Carica `rap` (incl. `template_id`) e il template standard (campi live).
2. `override` = template `solo_manuale` del committente; `effectiveCampi = risolviCampiManuali(override, standard)`.
3. `received = partiFotoRicevute(form)`; check MIME.
4. Valida obbligatorie su `effectiveCampi` (slot foto obbligatorie presenti in `received`).
5. Idempotenza per `richiestaId` (invariata).
6. Upload di **ogni** foto in `received` (storage), accumulando i path.
7. INSERT `interventi_manuali` + voce (invariato).
8. INSERT `interventi_manuali_foto` per **ogni** foto caricata.
9. Rollback storage/DB best-effort in caso di errore in qualsiasi punto (come oggi).

## Gestione errori

- Upload storage fallito → rollback dei file già caricati → 502 `upload_foto_fallito`.
- INSERT DB fallito → rollback storage (+ righe parziali) → 500.
- Parte `foto:*` non immagine → 400 `tipo_file_non_valido` (invariato).
- Eredità: se né override né standard hanno campi foto, la richiesta passa comunque
  e le eventuali foto ricevute vengono salvate (Livello 2). Nessuna perdita silenziosa.

## Testing

- Unit (vitest) sugli helper puri: `risolviCampiManuali`, `partiFotoRicevute`, `etichettaSlotFoto`.
- Verifica mirata in produzione (read-only) dopo il deploy: una nuova richiesta `lim_massive`
  con foto deve comparire in `interventi_manuali_foto` e nel pannello di revisione (Lista attesa).

## Fuori scope (Parte B, spec separata)

- "No doppio lavoro": campi azione obbligatori bloccanti + approvazione che crea
  l'intervento già `completato/eseguito_positivo`.
- Ripristino del template manuale `lim_massive` a "vuoto = eredita" (oggi è un override
  congelato dall'hotfix del 16/06): si farà quando il Livello 1 è in produzione.
- Recupero foto già perse (va fatto ri-caricando dai telefoni degli operatori).
