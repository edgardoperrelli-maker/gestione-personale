# Design — Assegnazioni manuali nel modulo mappe (Blocco A)

- **Data:** 2026-05-31
- **Stato:** approvato (in attesa di revisione finale utente)
- **Autore:** Edgardo Perrelli (con Claude)
- **Stack:** Next.js 15 (App Router) · React 19 · Supabase · Leaflet · TypeScript · Tailwind 4

---

## 1. Contesto e obiettivo

Nel modulo mappe (`/hub/mappa`) la distribuzione degli interventi agli operatori avviene
oggi in modo **automatico** (algoritmo K-means + ribilanciamento in
`components/modules/mappa/MappaOperatoriClient.tsx`). I piani salvati vivono in
`mappa_piani` / `mappa_piani_operatori`.

Si vuole aggiungere uno **strato opzionale di assegnazioni manuali** *sopra* la
distribuzione automatica: per alcuni operatori, quando serve, si può forzare *cosa* e
*dove* lavorano; tutti gli altri operatori e gli interventi non vincolati continuano con
la distribuzione automatica **esattamente come ora**. È un **"plus"**, non una
sostituzione.

I criteri di assegnazione (CAP, attività/servizio, ODS, indirizzo) sono gli **stessi
campi già presenti nel rapportino** e già presenti sull'oggetto `Task`
(`utils/routing/types.ts`).

## 2. Scope

**In scope (questo documento — Blocco A):**
- Assegnazione di **CAP** a un operatore
- Assegnazione di **attività/servizi** a un operatore
- Assegnazione per **ODS** (intervento specifico), con **fallback per indirizzo**
- Tetto **X interventi** per regola e **lucchetto** (dedicato vs aperto)
- Integrazione con la distribuzione automatica esistente
- Persistenza, API, test della logica

**Fuori scope (documenti / fasi separate):**
- **Blocco B** — Rapportino compilabile via link WhatsApp dal telefono dell'operatore
  (spec dedicata successiva)
- **Redesign** con colori vivi (rimandato esplicitamente, fase successiva)

## 3. Glossario

| Termine | Significato |
|---|---|
| **Regola** | Un'assegnazione manuale: operatore + filtri + X + lucchetto, legata a un piano |
| **Pin / pinnato** | Operatore/intervento vincolato da una regola |
| **ODS** | Ordine di Servizio del singolo intervento (`task.odsin`); identificatore "sicuro" di un intervento specifico |
| **X** | `max_interventi`: tetto di interventi assegnabili da una regola |
| **Lucchetto** | Impostazione **per-operatore** (non per-regola): 🔓 aperto = oltre ai suoi pinnati può ricevere altri interventi (altre regole / automatico) · 🔒 chiuso = sigillato ai soli interventi delle sue regole. Vedi §5.3 |
| **Cascata** | Ordine di priorità con cui le fasi reclamano gli interventi: ODS/Indirizzo → CAP → Attività → Automatico |

## 4. Modello dati

### 4.1 Mappatura filtri → campi `Task` (nessuna modifica al parser)

L'oggetto `Task` (`utils/routing/types.ts`) e `excelParser.ts` portano **già** tutti i
campi necessari:

| Filtro regola | Campo `Task` | Tipo | Match |
|---|---|---|---|
| 🎯 ODS | `task.odsin` | string | esatto (normalizzato) |
| 🏠 Indirizzo (fallback ODS) | `task.indirizzo` | string | "contiene", normalizzato (maiuscole/spazi/punteggiatura ignorati) |
| 📍 CAP | `task.cap` | string | esatto |
| 🔧 Attività | `task.attivita` | string | esatto (valori distinti del dataset + input libero) |

### 4.2 Schema SQL

> Le tabelle seguono lo schema di `mappa_piani` (cascade sul delete, RLS permissiva
> `FOR ALL TO authenticated`).

```sql
-- =====================================================================
-- Blocco A — Assegnazioni manuali nel modulo mappe
-- =====================================================================

-- 1) Regole di assegnazione manuale, legate al piano
CREATE TABLE IF NOT EXISTS mappa_assegnazioni_manuali (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  piano_id         UUID NOT NULL REFERENCES mappa_piani(id) ON DELETE CASCADE,
  staff_id         TEXT NOT NULL,
  staff_name       TEXT,                               -- denormalizzato per lo storico
  filtro_ods       TEXT[] NOT NULL DEFAULT '{}',       -- match su task.odsin
  filtro_indirizzo TEXT[] NOT NULL DEFAULT '{}',       -- fallback ODS, match su task.indirizzo
  filtro_cap       TEXT[] NOT NULL DEFAULT '{}',       -- match su task.cap
  filtro_attivita  TEXT[] NOT NULL DEFAULT '{}',       -- match su task.attivita
  max_interventi   INT,                                -- X (NULL = illimitato)
  ordine           INT NOT NULL DEFAULT 0,             -- priorità a parità di fase
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assegnazioni_piano
  ON mappa_assegnazioni_manuali(piano_id);

ALTER TABLE mappa_assegnazioni_manuali ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assegnazioni_all_authenticated"
  ON mappa_assegnazioni_manuali
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 2) Preset riutilizzabili (parte "ibrida")
CREATE TABLE IF NOT EXISTS mappa_assegnazioni_preset (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  staff_id        TEXT,
  filtro_cap      TEXT[] NOT NULL DEFAULT '{}',
  filtro_attivita TEXT[] NOT NULL DEFAULT '{}',
  -- niente ODS/indirizzo nei preset: puntano a interventi specifici, non riusabili
  max_interventi  INT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mappa_assegnazioni_preset ENABLE ROW LEVEL SECURITY;

CREATE POLICY "preset_all_authenticated"
  ON mappa_assegnazioni_preset
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 3) Lucchetto per-operatore nel piano (input della distribuzione, NON una regola)
CREATE TABLE IF NOT EXISTS mappa_piani_lucchetti (
  piano_id  UUID NOT NULL REFERENCES mappa_piani(id) ON DELETE CASCADE,
  staff_id  TEXT NOT NULL,
  aperto    BOOLEAN NOT NULL DEFAULT true,   -- true = 🔓 aperto · false = 🔒 chiuso (sigillato)
  PRIMARY KEY (piano_id, staff_id)
);

ALTER TABLE mappa_piani_lucchetti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lucchetti_all_authenticated"
  ON mappa_piani_lucchetti
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

### 4.3 Relazioni

```
mappa_piani 1 ─── N mappa_assegnazioni_manuali   (ON DELETE CASCADE)
mappa_piani 1 ─── N mappa_piani_lucchetti        (lock per-operatore, input)
mappa_piani 1 ─── N mappa_piani_operatori        (risultato distribuzione, già esistente)
mappa_assegnazioni_preset                        (indipendente, riusabile tra piani)
```

I **risultati** (chi ha preso quali interventi) restano in
`mappa_piani_operatori.tasks` come oggi. Le regole sono l'**input** che li ha prodotti,
conservato per ri-aprire/modificare il piano.

## 5. Logica di distribuzione (pre-passaggio + K-means)

Si inserisce un **pre-passaggio** prima del K-means, che resta **invariato** e riceve solo
un pool ridotto.

```
INTERVENTI (geocodificati)
        │
        ▼
┌──────────────────────────────────────────────┐
│ PRE-PASSAGGIO (nuovo) — funzione pura          │
│  applyManualAssignments(tasks, rules, ops, locks) │
│  Cascata: ODS/Indirizzo → CAP → Attività        │
└──────────────────────────────────────────────┘
        │  (interventi residui + operatori disponibili)
        ▼
┌──────────────────────────────────────────────┐
│ K-MEANS ESISTENTE (invariato)                  │
└──────────────────────────────────────────────┘
        │
        ▼
   MERGE → mappa_piani_operatori (come ora)
```

### 5.1 Cascata di priorità

Un intervento è "reclamato" nella **prima fase** in cui matcha una regola e **non torna
più indietro**:

1. 🎯 **ODS** → se l'ODS non è nel dataset, 🏠 **Indirizzo** *(stessa fase: identificano l'intervento specifico)*
2. 📍 **CAP**
3. 🔧 **Attività**
4. ⚙️ **Automatico** (K-means su tutto il resto)

Una regola **combinata** (più filtri) è valutata nella fase del suo **filtro più forte**
presente (se contiene un ODS → fase ODS), ma il match richiede comunque **tutti** i filtri
in **AND**. A parità di fase decide l'`ordine` definito dall'utente.

### 5.2 Pseudo-codice della funzione pura

```ts
// Funzione PURA, isolata dal componente React → testabile con Vitest
function applyManualAssignments(tasks, rules, operators, locks) {
  const assigned = new Map<taskId, staffId>();
  const pinnedCount = new Map<staffId, number>();
  const warnings: Warning[] = [];

  const phaseOf = (rule) =>
    rule.filtro_ods.length || rule.filtro_indirizzo.length ? 0   // ODS / Indirizzo
    : rule.filtro_cap.length                                ? 1   // CAP
    :                                                          2;  // Attività

  const matches = (task, rule) =>
    (!rule.filtro_ods.length       || rule.filtro_ods.includes(norm(task.odsin))) &&
    (!rule.filtro_indirizzo.length || rule.filtro_indirizzo.some(a => normAddr(task.indirizzo).includes(normAddr(a)))) &&
    (!rule.filtro_cap.length       || rule.filtro_cap.includes(norm(task.cap))) &&
    (!rule.filtro_attivita.length  || rule.filtro_attivita.includes(norm(task.attivita)));

  for (const phase of [0, 1, 2]) {
    const inPhase = rules.filter(r => phaseOf(r) === phase)
                         .sort((a, b) => a.ordine - b.ordine);
    for (const rule of inPhase) {
      const free = tasks.filter(t => !assigned.has(t.id) && matches(t, rule));
      if (free.length === 0) { warnings.push(emptyRule(rule)); continue; }
      const X = rule.max_interventi ?? Infinity;
      const take = free.slice(0, X);
      if (free.length > X) warnings.push(overflow(rule, free.length - X));
      for (const t of take) {
        assigned.set(t.id, rule.staff_id);
        pinnedCount.set(rule.staff_id, (pinnedCount.get(rule.staff_id) ?? 0) + 1);
      }
    }
  }

  // Lucchetti (per-operatore, input separato dalle regole; default aperto)
  const isClosed = (id) => locks.get(id) === false;        // false = 🔒 chiuso
  const closed = new Set(operators.filter(o => isClosed(o.id)).map(o => o.id));
  const pool = operators.filter(o => !closed.has(o.id))
                        .map(o => ({ ...o, capacityRemaining: o.capacity - (pinnedCount.get(o.id) ?? 0) }));
  for (const id of closed) if (!pinnedCount.get(id)) warnings.push(closedEmpty(id));

  const unassigned = tasks.filter(t => !assigned.has(t.id));
  return { assigned, unassigned, pool, warnings };
  // → unassigned + pool vanno al K-means esistente; poi MERGE per operatore
}
```

`norm` = trim + uppercase; `normAddr` = `norm` + rimozione punteggiatura/spazi multipli.

### 5.3 Semantica del lucchetto (per-operatore)

Il lucchetto è un'impostazione **per-operatore**, **indipendente dalle regole** (non è un
campo della regola). Un operatore può avere più regole (es. ODS + CAP); il lucchetto
decide cosa accade *oltre* agli interventi che le sue regole gli assegnano:

- 🔓 **Aperto** (default): oltre ai suoi pinnati, l'operatore può ricevere **altri
  interventi** — sia eventuali eccedenze di altre regole, sia la **distribuzione
  automatica** sul resto del territorio.
- 🔒 **Chiuso**: l'operatore è **sigillato** ai soli interventi delle sue regole; non
  entra nient'altro (né altre regole né automatico) → esce dal pool del K-means.

Persistito in `mappa_piani_lucchetti (piano_id, staff_id, aperto)`, default `aperto = true`
(minima alterazione dell'automatico; modificabile per operatore).

## 6. Interfaccia e flusso utente

Tutto nell'editor di pianificazione (`MappaOperatoriClient`), in un nuovo pannello
laterale **"Assegnazioni manuali"**.

1. Carico gli interventi da Excel **come ora**.
2. **"Assegnazioni manuali" → "+ Aggiungi regola"**.
3. Per ogni regola:
   - **Operatore** (menu a tendina, da `operatorOptions`)
   - **Filtri a chip**: 🎯 ODS · 🏠 Indirizzo · 📍 CAP · 🔧 Attività
     (CAP e Attività suggeriscono i valori **presenti nel dataset**)
   - **X** (max interventi, opzionale)
   - *(opzionale)* **Salva/Carica preset**
   - **Anteprima live**: *"questa regola matcha N interventi"*
4. **Riordino** delle regole (priorità a parità di fase).
5. **Distribuisci** → pre-passaggio + K-means.
6. **Feedback visivo**:
   - Interventi pinnati con icona 🎯/🔒 e colore dell'operatore sulla mappa
   - Badge per operatore: *"8 manuali + 22 auto = 30"*
   - Avvisi (vedi §7)
7. **Salvo il piano** → le regole si salvano e si **ricaricano** ri-aprendolo.

Il pannello mostra la **lista delle regole attive** (modifica/elimina) e la **lista degli
operatori pinnati**, ognuno con il proprio **toggle lucchetto 🔓/🔒** (per-operatore):
aperto = resta nell'automatico oltre ai pinnati; chiuso = sigillato ai soli pinnati.

### 6.1 Fallback ODS → Indirizzo

Nell'editor regola, l'anteprima live verifica l'ODS digitato. Se matcha **0 interventi**:
- compare l'avviso *"ODS X non presente nel dataset"*;
- si apre il campo **🏠 Indirizzo**;
- l'utente compila l'indirizzo → match normalizzato "contiene" su `task.indirizzo`;
- se più righe corrispondono, mostra il conteggio e le fa **confermare**.

### 6.2 Stile visivo (design Aurea)

La UI di questa funzione segue il design del progetto gemello **Aurea**
(`C:\Users\Edgardo\Desktop\gestilab-aurea`): font **Geist**, palette **cyan neon** (primario)
+ **magenta** (accenti), **navy** per le aree scure, angoli molto arrotondati, ombre con
**glow** cyan, chip a pillola con colori di stato (cyan/verde/ambra/magenta), sfondo a
gradiente. Mockup di riferimento in `docs/superpowers/mockups/` (4 schermi + gallery).
Il **redesign completo** dell'app in stile Aurea è una fase separata (vedi §11): qui lo stile
si applica **solo a questa funzione**.

## 7. Casi limite e gestione errori

Comportamenti deterministici; avvisi chiari ma **non bloccanti** (le scelte manuali sono
sempre rispettate).

| Caso | Tipo | Comportamento |
|---|---|---|
| Stesso ODS su due operatori | ⚠️ Avviso | Vince l'`ordine` più alto; l'altra ignorata: *"ODS X già assegnato a [operatore]"* |
| ODS non trovato | ⚠️ Avviso → azione | Avviso + apertura campo **Indirizzo** (fallback, §6.1) |
| Regola che non matcha nulla | ⚠️ Avviso | Nessun effetto: *"Regola di [operatore]: 0 interventi trovati"* |
| X minore dei match | ℹ️ Info | Assegna fino a X, l'eccesso scende nella cascata: *"40 corrispondono, assegnati 30, 10 redistribuiti"* |
| Operatore 🔒 chiuso senza match | ⚠️ Avviso | Esce dall'automatico e resta a 0: *"[operatore] 🔒 senza interventi: resterà vuoto"* |
| Conflitto stessa fase (due regole CAP) | ✅ Auto | Decide l'`ordine`; il primo prende (fino a X), il resto scende |
| Intervento in ZTL non autorizzata per il pinnato | ⚠️ Avviso | Pin **rispettato**; resta l'avviso ZTL esistente (`getTaskZtl`), logica ZTL invariata |
| Appuntamento senza ODS (`isAppointment`) | ✅ Auto | Regole applicate per i campi presenti (CAP/attività); senza `odsin` non matcha le regole ODS |
| Intervento a 2 operatori (`requiresTwoOperators`) | ⚠️ Avviso | La regola assegna il **primo**; il secondo resta gestito dalla logica attuale, con avviso |
| Regola incompleta (no filtro / no operatore) | ❌ Errore | Bloccata nell'UI |
| "Distribuisci" senza dataset | ❌ Errore | Pulsante disabilitato |

## 8. Persistenza & API

- **Salvataggio piano**: estendere `POST /api/mappa/piani` (`app/api/mappa/piani/route.ts`).
  Il payload include `regole[]` (in `mappa_assegnazioni_manuali`) e i **lucchetti
  per-operatore** (in `mappa_piani_lucchetti`), salvati in modo **atomico**
  (delete-then-insert per `piano_id`).
- **Lettura piano**: il `GET` restituisce anche `regole[]` → l'editor le ricarica.
- **Preset**: nuovo endpoint `/api/mappa/assegnazioni-preset` (GET / POST / DELETE).
- **Validazione**: schema **zod** (operatore obbligatorio, almeno un filtro valorizzato,
  `max_interventi` ≥ 1 se presente, array di stringhe).
- **Auth**: stesso pattern delle altre route mappa; scritture via service role.

## 9. Testing (Vitest)

Il progetto **non ha ancora un test runner** → si introduce **Vitest** (`npm i -D vitest`,
script `"test": "vitest"`).

La logica del pre-passaggio è isolata nella **funzione pura**
`applyManualAssignments(tasks, rules, operators)` (in `utils/routing/` o
`lib/`), così è testabile senza React né mappa.

**Casi di test (minimo):**
- Match AND su filtri combinati
- Cascata: ODS/Indirizzo → CAP → Attività → Automatico
- Fallback indirizzo (ODS assente → match per indirizzo "contiene")
- Tetto X e overflow redistribuito
- Lucchetto chiuso (operatore fuori dall'automatico) e aperto (capacità ridotta)
- ODS doppio → risoluzione per `ordine` + warning
- Regola a vuoto → warning, nessun effetto
- Normalizzazione (maiuscole/spazi/punteggiatura)

Il K-means resta **intatto** (nessun nuovo test su di esso). Verifica manuale finale
nell'app con un dataset di esempio.

## 10. File coinvolti (riferimenti)

| Area | File |
|---|---|
| Tipi Task / parser | `utils/routing/types.ts`, `utils/routing/excelParser.ts` |
| Editor mappa + distribuzione | `components/modules/mappa/MappaOperatoriClient.tsx` |
| Funzione pura (nuova) | `utils/routing/applyManualAssignments.ts` (+ test) |
| API piani | `app/api/mappa/piani/route.ts` |
| API preset (nuova) | `app/api/mappa/assegnazioni-preset/route.ts` |
| Migrazione SQL (nuova) | `supabase/migrations/<timestamp>_mappa_assegnazioni_manuali.sql` |
| Pagina/registro | `app/hub/mappa/page.tsx`, `components/modules/mappa/RegistroPianificazioni.tsx` |

## 11. Passi futuri (fuori scope qui)

- **Blocco B** — Rapportino compilabile via link WhatsApp (spec dedicata): i campi
  CAP/attività/ODS/indirizzo usati qui sono gli **stessi** del rapportino → bridge naturale.
- **Redesign completo** dell'app nel design di **Aurea** (`gestilab-aurea`): tema OKLch
  (cyan neon/magenta, navy), componenti Base UI/shadcn, font Geist — è il "redesign colori
  vivi". Spec dedicata successiva. _Questa funzione viene già costruita in stile Aurea (§6.2)._
