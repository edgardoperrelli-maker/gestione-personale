# Registro Misuratori Rimossi — Design Spec

**Data:** 2026-06-08  
**Progetto:** gestione-personale (committente ACEA)  
**Autore:** Edgardo Perrelli + Claude

---

## Contesto e Obiettivo

Quando un operatore esegue con esito positivo un intervento di **rimozione misuratore** (identificato da `intervento_tipo` che contiene "rimozione" + `matricola` presente), il misuratore rimosso deve essere tracciato in un registro dedicato. Questo registro consente all'ufficio di aggiornare lo stato logistico del misuratore (dal momento della rimozione fino alla riconsegna al committente) e di stampare un riepilogo PDF.

**Fuori scope:** la "rimozione allaccio abusivo" non produce un record nel registro perché non comporta lo scarico di un contatore — si distingue automaticamente dall'assenza di `matricola`.

---

## 1. Modello Dati

### Nuova tabella `misuratori_rimossi`

```sql
CREATE TABLE misuratori_rimossi (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervento_id    UUID UNIQUE REFERENCES interventi(id),   -- 1:1, garantisce idempotenza
  rapportino_id    UUID REFERENCES rapportini(id),

  -- Dati copiati al momento dell'invio rapportino (snapshot)
  odl              TEXT,
  data_esecuzione  DATE NOT NULL,
  esecutore        TEXT,            -- rapportini.staff_name
  indirizzo        TEXT,
  comune           TEXT,
  matricola        TEXT NOT NULL,
  pdr              TEXT,

  -- Stato logistico
  stato            TEXT NOT NULL DEFAULT 'da_consegnare_deposito',
  -- valori: da_consegnare_deposito | scaricato_deposito | verificato_deposito
  --         | in_consegna_committente | consegnato_committente

  note             TEXT,

  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
```

### Progressione stati (lineare)

```
da_consegnare_deposito
  → scaricato_deposito
    → verificato_deposito
      → in_consegna_committente
        → consegnato_committente
```

Non ci sono transizioni all'indietro previste dall'utente; il dropdown mostrerà tutti i 5 valori per permettere correzioni.

---

## 2. Auto-popolamento

### Trigger: invio rapportino

Il popolamento avviene nell'endpoint esistente di invio rapportino (`POST /api/r/[token]/invia`), dopo che `rapportini.stato` viene impostato a `'inviato'`.

**Logica:**

```
Per ogni voce del rapportino (rapportino_voci):
  JOIN interventi ON rapportino_voci.intervento_id = interventi.id
  WHERE interventi.esito = 'eseguito_positivo'
    AND rapportino_voci.matricola IS NOT NULL
    AND rapportino_voci.matricola != ''

  → INSERT INTO misuratori_rimossi (...) ON CONFLICT (intervento_id) DO NOTHING
```

Il `DO NOTHING` sul conflict rende l'operazione idempotente: un re-invio accidentale non crea duplicati né sovrascrive stati già aggiornati dall'ufficio.

**Campi copiati:**

| Campo destinazione     | Fonte                            |
|------------------------|----------------------------------|
| `odl`                  | `rapportino_voci.odl`            |
| `data_esecuzione`      | `interventi.data`                |
| `esecutore`            | `rapportini.staff_name`          |
| `indirizzo`            | `rapportino_voci.via`            |
| `comune`               | `rapportino_voci.comune`         |
| `matricola`            | `rapportino_voci.matricola`      |
| `pdr`                  | `rapportino_voci.pdr`            |
| `stato`                | `'da_consegnare_deposito'` (default) |

### Fallback: pulsante "Ricalcola"

Endpoint `POST /api/misuratori/sync` — accessibile solo agli utenti ufficio. Percorre tutti gli `interventi` con:
- `esito = 'eseguito_positivo'`
- `matricola_contatore NOT NULL AND != ''`
- `id NOT IN (SELECT intervento_id FROM misuratori_rimossi)`

e inserisce i record mancanti. Utile per dati pregressi (rapportini già inviati prima dell'introduzione del modulo).

---

## 3. API

| Metodo | Endpoint | Scopo |
|--------|----------|-------|
| `GET`  | `/api/misuratori` | Lista con filtri (periodo, stato, comune, esecutore) |
| `PATCH`| `/api/misuratori/[id]` | Aggiorna `stato` e/o `note` di un record |
| `POST` | `/api/misuratori/sync` | Sync manuale (fallback dati pregressi) |

---

## 4. Modulo UI

### Posizione

Nuova route: `app/(protected)/misuratori/page.tsx`  
Client component: `components/modules/misuratori/MisuratoriClient.tsx`  
Pattern identico a `MappaOperatoriClient`, `RiepilogoRapportini`.

### Layout

**Header:**
- Titolo "Misuratori Rimossi"
- Pulsante primario "Esporta PDF"
- Pulsante secondario "Ricalcola" (piccolo, per admin)

**Barra filtri:**
- Periodo: Dal / Al (data_esecuzione)
- Stato: select (tutti + i 5 valori)
- Comune: testo o select dinamica dai comuni presenti
- Esecutore: select dinamica dagli esecutori presenti

**Tabella:**

| ODS/ODL | Data | Esecutore | Indirizzo | Comune | Matricola | PDR | Stato | Note |
|---------|------|-----------|-----------|--------|-----------|-----|-------|------|

- **Stato:** dropdown inline con badge colorato
- **Note:** campo editabile inline (click per attivare, blur per salvare)
- Ordinamento per colonna: Data, Stato, Comune
- Ottimistic update su cambio stato (stessa logica del rapportino)

### Badge stati

| Stato                    | Colore  |
|--------------------------|---------|
| da_consegnare_deposito   | grigio  |
| scaricato_deposito       | giallo/ambra |
| verificato_deposito      | blu     |
| in_consegna_committente  | arancio |
| consegnato_committente   | verde   |

---

## 5. Export PDF

Generazione client-side al click di "Esporta PDF".

**Libreria:** `@react-pdf/renderer` (da verificare in `package.json`; alternativa: `jsPDF` + `jspdf-autotable`).

**Contenuto del documento:**

1. **Intestazione:**
   - Titolo: "Registro Misuratori Rimossi — ACEA"
   - Periodo filtrato (es. "01/06/2026 – 08/06/2026")
   - Filtri attivi (stato, comune, esecutore se selezionati)
   - Data di stampa e conteggio righe

2. **Tabella:** stesse colonne della UI (ODS/ODL, Data, Esecutore, Indirizzo, Comune, Matricola, PDR, Stato, Note)

3. **Footer:** numerazione pagine (es. "Pagina 1 di 3")

Il PDF rispecchia esattamente la vista filtrata corrente — nessuna selezione manuale aggiuntiva.

---

## 6. File da creare / modificare

### Nuovi file

| File | Scopo |
|------|-------|
| `app/(protected)/misuratori/page.tsx` | Route page |
| `components/modules/misuratori/MisuratoriClient.tsx` | Client principale |
| `components/modules/misuratori/MisuratoriTabella.tsx` | Tabella con filtri |
| `components/modules/misuratori/StatoBadge.tsx` | Badge colorato stato |
| `components/modules/misuratori/MisuratoriPdf.tsx` | Documento PDF |
| `app/api/misuratori/route.ts` | GET lista |
| `app/api/misuratori/[id]/route.ts` | PATCH stato/note |
| `app/api/misuratori/sync/route.ts` | POST sync fallback |

### File da modificare

| File | Modifica |
|------|----------|
| `app/api/r/[token]/invia/route.ts` | Aggiunge hook post-invio per popolare `misuratori_rimossi` |
| `components/layout/Sidebar.tsx` (o navigazione) | Aggiunge voce "Misuratori" al menu |

### SQL (migration)

Una migration Supabase con `CREATE TABLE misuratori_rimossi` e relativo indice su `intervento_id`.

---

## 7. Fuori scope (per questa iterazione)

- Notifiche push/email al cambio stato
- Storico modifiche stato (audit log)
- Assegnazione responsabile per fase logistica
- Import/export Excel (solo PDF per ora)
