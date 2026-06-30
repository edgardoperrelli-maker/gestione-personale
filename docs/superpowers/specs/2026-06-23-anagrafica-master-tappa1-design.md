# Anagrafica master — Tappa 1: fondamenta (tabelle + seed + pagina di consultazione)

**Data:** 2026-06-23
**Stato:** design approvato in brainstorming, in attesa di review utente
**Ambito:** Tappa 1 di 6 della ristrutturazione dell'anagrafica (committenti / territori / contratti / gruppi attività / attività)

---

## 1. Contesto e obiettivo

Oggi il sistema mischia tre concetti che dovrebbero essere distinti e gerarchici:

- **Committente** è un *enum blindato* (`'acea' | 'italgas' | 'altro' | 'lim_massive'`) ripetuto in 5 punti che devono restare allineati: tipo TypeScript (`lib/interventi/manuali/types.ts:10`), schema Zod (`lib/rapportini/templateSchema.ts:36`), 3 vincoli `CHECK` SQL (`interventi`, `interventi_manuali`, `rapportino_template`), etichette (`lib/interventi/manuali/etichettaCommittente.ts`), menu hardcoded (`ModaleInterventoManuale.tsx`, `TemplateRapportiniClient.tsx`). Confrontato con `===` case-sensitive in ~18 punti.
- **`lim_massive` è un committente finto**: in realtà è un'attività di Acea (569 interventi).
- **Territorio** esiste già (tabella `territories`, 10 voci) ma non è legato al committente.
- **Attività** è testo libero (`rapportino_voci.attivita`, 60+ valori distinti), senza gerarchia gruppo→attività.
- **Contratto** (numero commessa, es. `5800004311`) **non esiste**. La colonna `interventi.contratto` ha un altro significato (id utenza Acea sulla targa) e non va toccata.

**Obiettivo della ristrutturazione** (deciso in brainstorming): modello *data-driven* completo — committenti, territori↔committente, contratti, gruppi attività e attività diventano **dati in tabelle**, non più codice. Aggiungere un committente domani = una riga, non una modifica in 5 file.

**Tassonomia target** (sorgente di verità):

```
Acea
 ├─ Territorio: Acea            → Contratto 36000002158
 └─ Gruppi: Limitazioni massive · Dunning
      Dunning → Limitazione flusso idrico · Regolarizzazione flusso idrico ·
               Revoca disattivazione cessata morosità · Revoca limitazione flusso ·
               Riapertura fornitura cessata morosità · Riattivazione fornitura ·
               Rimozione impianto abusivo · Rimozione misuratore per morosità ·
               Ripristino da morosità · Sospensione fornitura
Italgas
 ├─ Territori → Contratti: Perugia 2i84104578 · Lazio Est 5800005633 ·
 │                          Lazio Centro 5800005634 · Napoli (da inserire)
 └─ Gruppi: Picarro · Attività alla clientela (S-AI-049, S-AI-050…) ·
            Risanamento colonne · Morosità complesse · Bonifiche extra
ToscanaEnergia
 ├─ Territorio: Firenze         → Contratto 5800004311
 └─ Gruppi: (uguali a Italgas) Picarro · Attività alla clientela ·
            Risanamento colonne · Morosità complesse · Bonifiche extra
Altro  (catch-all, mantenuto)
```

**Tappa 1** costruisce SOLO le fondamenta: crea e riempie le tabelle e aggiunge una pagina admin di **sola lettura**. **Nessun cambio di comportamento** per gli utenti: il sistema continua a girare esattamente come adesso; le nuove tabelle vivono "a fianco" come sorgente di verità. Le tappe successive (2→6) collegheranno il resto del sistema a questa anagrafica.

### Non-obiettivi di Tappa 1 (deliberatamente esclusi)

- NON si aggiungono FK/vincoli sulle colonne `committente` esistenti (resterebbero violate da `lim_massive` fino alla Tappa 3). L'enum/CHECK resta com'è.
- NON si migrano i 569 interventi `lim_massive` (Tappa 3).
- NON si mappano i 60+ valori testo storici di `rapportino_voci.attivita` (Tappa 4).
- NON si tocca la modale "+", l'editor template, l'export, l'Assegnazione AI/agente (Tappe 4-6).
- NON si introduce la gestione CRUD dell'anagrafica via UI: solo consultazione (CRUD nelle tappe dove serve).
- NON si introducono periodi di validità sui contratti (YAGNI: un solo contratto attivo per territorio; se in futuro i contratti ruotano nel tempo si aggiunge un modello a periodi come `staff_cost_center_ranges`).

---

## 2. Modello dati (DDL)

Tutto additivo: nuove tabelle + colonne **nullable** su tabelle esistenti. Nessuna colonna esistente viene rimossa o ristretta.

### 2.1 `committenti` (lookup, sorgente di verità)

| Colonna | Tipo | Note |
|---|---|---|
| `codice` | text **PK** | codice macchina stabile: `acea`, `italgas`, `toscana_energia`, `altro` |
| `etichetta` | text NOT NULL | display: `Acea`, `Italgas`, `ToscanaEnergia`, `Altro` |
| `ordine` | smallint NOT NULL default 0 | ordinamento in UI |
| `attivo` | boolean NOT NULL default true | |
| `created_at` | timestamptz default now() | |

**Scelta chiave:** `codice` è PK **text** (non uuid) perché le colonne esistenti `interventi.committente` / `interventi_manuali.committente` / `rapportino_template.committente` già contengono questo testo. Così in Tappa 2 si potrà aggiungere la FK senza riscrivere i valori salvati. `lim_massive` **non** viene inserito (è un'attività, non un committente): la sua assenza è voluta e innocua finché non c'è FK.

Seed: `acea`/Acea (0), `italgas`/Italgas (1), `toscana_energia`/ToscanaEnergia (2), `altro`/Altro (9).

### 2.2 `territories` (esistente) — aggiunta colonna

| Colonna nuova | Tipo | Note |
|---|---|---|
| `committente_codice` | text NULL **REFERENCES** `committenti(codice)` | lega territorio → committente; NULL ammesso (es. MAGAZZINO) |

Aggiornamento dati (UPDATE mirati per nome, case-insensitive):

| Territorio | `committente_codice` | `active` |
|---|---|---|
| ACEA | `acea` | true |
| PERUGIA, LAZIO EST, LAZIO CENTRO, NAPOLI | `italgas` | true |
| FIRENZE | `toscana_energia` | true |
| MAGAZZINO | NULL (speciale: "operatore in magazzino, nessun contratto") | true |
| AURELIA, MILANO, PADOVA | NULL | **false** (disattivati) |

**AURELIA** ha 1 intervento + 1 piano collegati → **non** si cancella; si disattiva (`active=false`). MILANO/PADOVA sono liberi ma si disattivano per uniformità (reversibile). La disattivazione li toglie dai menu, mantenendo intatti gli storici.

### 2.3 `contratti` (nuova)

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | |
| `numero` | text NOT NULL | es. `5800004311`, `2i84104578`, `36000002158` |
| `committente_codice` | text NOT NULL REFERENCES `committenti(codice)` | |
| `territorio_id` | uuid NOT NULL REFERENCES `territories(id)` | |
| `attivo` | boolean NOT NULL default true | |
| `created_at` | timestamptz default now() | |

Indice unico parziale: `UNIQUE (territorio_id) WHERE attivo` → un solo contratto attivo per territorio.

Seed contratti:

| Territorio | Committente | Numero |
|---|---|---|
| Firenze | toscana_energia | 5800004311 |
| Lazio Centro | italgas | 5800005634 |
| Lazio Est | italgas | 5800005633 |
| Acea | acea | 36000002158 |
| Perugia | italgas | 2i84104578 |
| Napoli | italgas | *(non inserito — "da inserire")* |

Napoli resta **senza** riga contratto: la pagina lo mostrerà come "contratto da inserire".

### 2.4 `gruppi_attivita` (nuova, livello 1)

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | |
| `committente_codice` | text NOT NULL REFERENCES `committenti(codice)` | |
| `nome` | text NOT NULL | es. `Limitazioni massive`, `Dunning`, `Picarro` |
| `ordine` | smallint default 0 | |
| `attivo` | boolean default true | |

Indice unico: `UNIQUE (committente_codice, nome)`.

Seed gruppi:

- **acea**: `Limitazioni massive`, `Dunning`
- **italgas**: `Picarro`, `Attività alla clientela`, `Risanamento colonne`, `Morosità complesse`, `Bonifiche extra`
- **toscana_energia**: `Picarro`, `Attività alla clientela`, `Risanamento colonne`, `Morosità complesse`, `Bonifiche extra`

### 2.5 `activities` (esistente) — aggiunta colonna + seed attività note

| Colonna nuova | Tipo | Note |
|---|---|---|
| `gruppo_id` | uuid NULL REFERENCES `gruppi_attivita(id)` | lega attività → gruppo (livello 2) |

In Tappa 1 si seminano SOLO le attività di dettaglio **esplicitamente note**, agganciate al gruppo:

- gruppo Acea/`Dunning` → le 10 attività elencate (Limitazione flusso idrico, Regolarizzazione flusso idrico, Revoca disattivazione cessata morosità, Revoca limitazione flusso, Riapertura fornitura cessata morosità, Riattivazione fornitura, Rimozione impianto abusivo, Rimozione misuratore per morosità, Ripristino da morosità, Sospensione fornitura).
- gruppo Acea/`Limitazioni massive` → attività `LIMITAZIONI MASSIVE` (allineata al testo storico).

Seed idempotente: `INSERT ... ON CONFLICT (name) DO UPDATE SET gruppo_id = ...` se `activities.name` è unico; altrimenti upsert per nome con guardia. I gruppi Italgas/ToscanaEnergia senza foglie esplicite (Picarro, Risanamento colonne, Morosità complesse, Bonifiche extra) restano senza attività di dettaglio in Tappa 1; "Attività alla clientela" (codici S-AI-…) sarà popolata in Tappa 4 mappando i valori storici.

### 2.6 RLS

Le tre tabelle nuove (`committenti`, `contratti`, `gruppi_attivita`) abilitano RLS coerente col resto del progetto:
- `SELECT` consentito agli utenti autenticati (la pagina di consultazione legge).
- Nessuna scrittura da client: il popolamento avviene solo via migration/seed. (La gestione CRUD arriverà in tappe successive con policy dedicate.)

`territories` e `activities` mantengono le policy esistenti; le colonne aggiunte non cambiano le regole.

---

## 3. Pagina di consultazione (sola lettura)

- **Percorso:** `/impostazioni/anagrafica` (coerente con `/impostazioni/template-rapportini`).
- **Accesso:** admin / admin_plus (come le altre voci di Impostazioni). Voce nel menu Impostazioni.
- **Contenuto:** vista ad albero per committente attivo:
  - intestazione committente (etichetta);
  - sezione **Territori & contratti**: elenco territori attivi del committente con il numero di contratto accanto; Napoli evidenziato con badge "contratto da inserire";
  - sezione **Gruppi attività**: elenco gruppi, ciascuno espandibile sulle attività di dettaglio (dove presenti).
  - sezione finale **Non attivi** (collassata): territori disattivati (AURELIA, MILANO, PADOVA) mostrati in grigio, per trasparenza.
- **Natura:** sola lettura. Nessun pulsante di modifica. I dati provengono da una query server-side che fa il join committenti → territori/contratti e committenti → gruppi → attività.
- **Componenti:** riuso dello stile sobrio enterprise corrente (token `--brand-*`); nessun nuovo pattern visivo.

---

## 4. Garanzia "nessun caos" (analisi di rischio)

| Cambiamento | Impatto | Rischio |
|---|---|---|
| Nuove tabelle `committenti`/`contratti`/`gruppi_attivita` | Additivo puro, nessuno le legge ancora se non la nuova pagina | 🟢 nullo |
| Colonne nullable `territories.committente_codice`, `activities.gruppo_id` | Additive, nessun codice esistente le legge | 🟢 nullo |
| Seed dati | Solo INSERT in tabelle nuove | 🟢 nullo |
| `UPDATE territories SET committente_codice=…` | Valorizza una colonna nuova | 🟢 nullo |
| `UPDATE territories SET active=false` per AURELIA/MILANO/PADOVA | Li toglie dai menu; AURELIA mantiene 1 intervento + 1 piano (riferimenti per id, intatti) | 🟡 basso — verificare che i picker/visualizzazioni gestiscano un territorio inattivo già referenziato (mostrare il nome anche se inattivo) |
| Nuova pagina `/impostazioni/anagrafica` | Nuova rotta isolata, sola lettura | 🟢 nullo |

Punto da verificare in implementazione (unico 🟡): l'intervento/piano che puntano ad AURELIA devono continuare a mostrare correttamente il nome del territorio anche con `active=false`. Test mirato: aprire quell'intervento e quel piano dopo la disattivazione.

---

## 5. Strategia di test

- **Unit (puri):** helper di costruzione dell'albero anagrafica (committente → territori/contratti, committente → gruppi → attività) testato con dati di esempio; gestione del caso "territorio senza contratto" (Napoli) e "committente senza foglie" (gruppi Italgas).
- **Migrazione idempotente:** la SQL di seed deve poter girare due volte senza errori né duplicati (`ON CONFLICT`).
- **Verifica dati post-seed (read-only):** query di controllo che (a) ogni committente atteso esista, (b) i 5 contratti siano agganciati al territorio giusto, (c) AURELIA/MILANO/PADOVA siano `active=false`, (d) MAGAZZINO resti senza committente e attivo, (e) i 10 gruppi/attività Dunning ci siano.
- **Regressione mirata:** baseline lint/test rosso noto (preesistente); il gate vale come "nessun nuovo problema dai file della tappa" (`npx eslint`/`npx vitest run` sui file toccati).
- **Smoke manuale:** aprire `/impostazioni/anagrafica` e verificare l'albero; aprire l'intervento/piano di AURELIA per confermare che il nome territorio si vede ancora.

---

## 6. Consegna

- DDL + seed come **migration** in `supabase/migrations/` (file datato) e come **SQL eseguibile su produzione** consegnata all'utente quando la tappa è pronta (l'utente la lancia dal PC; SQL fornita in chat solo su richiesta esplicita, come da preferenza).
- A fine tappa: commit + push su `main` (Vercel auto-deploy), nessun lavoro lasciato solo in locale.
- `tools/` resta escluso dal build (tsconfig) come oggi.

---

## Appendice — Roadmap completa (per contesto, fuori ambito Tappa 1)

1. **Anagrafica master** 🟢 — *questa spec*.
2. **Committente data-driven + ToscanaEnergia** 🟡 — menu/etichette/Zod leggono da `committenti`; aggiunta `toscana_energia`; confronti resi robusti; FK (dopo che `lim_massive` è migrato).
3. **Migrazione `lim_massive` → Acea + gruppo** 🔴 — backfill 569 interventi + riscrittura delle 4 automazioni che cercano `lim_massive`; verifica before/after sull'export SharePoint.
4. **Gerarchia gruppo→attività + storici** 🟡 — mapping dei 60+ valori testo (rivisto dall'utente); raggruppamento in report/export/Storico; filtro per gruppo/attività nello Storico.
5. **Contratti** 🟢 — aggancio contratto↔territorio→interventi; visibilità in export/PDF/fatturazione.
6. **Operatività & AI** 🟡 — modale "+", editor template, Assegnazione AI/agente leggono la nuova gerarchia.
