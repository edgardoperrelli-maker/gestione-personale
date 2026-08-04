# Ritiro dell'agente Playwright — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** togliere dal progetto l'agente Playwright locale, i due moduli che gli parlavano (Agente, Assegnazione AI), i loro endpoint e le loro tabelle — senza che Produzione economica, il modulo ACEA e il modulo AcquaLatina perdano un dato.

**Architettura:** rimozione in tre movimenti. Prima si mette in salvo ciò che è condiviso ma vive nella cartella sbagliata (`partiRoma`) e si riduce Produzione economica a una fonte sola. Poi si cancellano UI, endpoint, lib e tool. Per ultime, **dopo che il codice è in produzione**, le tabelle.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Supabase (PostgREST + service role), Vitest.

---

## Global Constraints

- **Italiano** in commenti, nomi e testi a video: è la lingua del progetto.
- **Repo PUBBLICO.** Nessun dato di produzione nei commit: niente matricole, ODL, indirizzi, nomi di dipendenti, path SharePoint, chiavi.
- **Ordine di deploy, non negoziabile:** tutto il codice va in produzione PRIMA che le tabelle vengano droppate. Il contrario è già costato una colonna vuota in produzione il 04/08 (PR #222).
- **La suite resta verde a ogni task.** Comando: `npm test`. Il lint ha una baseline rossa nota (~89 errori pre-esistenti): non è un cancello, ma **non deve peggiorare** sui file toccati.
- **`npx tsc --noEmit` pulito a ogni commit.** È il vero rilevatore di fili lasciati attaccati.
- **`lib/apiExportKey.ts` e `app/api/export/limitazioni-massive/route.ts` NON si toccano.** Verificato: la chiave è usata anche dall'endpoint di export, che non fa parte dell'agente. (Con l'agente ritirato quell'endpoint non ha più chiamanti: è cruft, ma è **fuori dallo scope di questa spec** — si segnala nel report finale, non si rimuove qui.)
- **Niente `git push` né merge senza un ok esplicito dell'utente.**
- Messaggi di commit in italiano, stile del repo: `refactor(scope): …`, `chore(scope): …`, `docs: …`.

---

## Sull'ordine dei task

La spec elenca **spegnimento → codice → tabelle**. Qui i primi due task sono preparatori
(spostare `partiRoma`, ridurre Produzione economica a una fonte) e vengono prima dello
spegnimento: non cambiano un comportamento, e mettono al riparo le due cose condivise **prima**
che la cartella dell'agente sparisca. L'ordine della spec resta rispettato dove conta davvero —
in produzione arriva un solo deploy, con dentro tutti i Task 1–7, e **le tabelle cadono solo
dopo** (Task 8). Quella è la sequenza che un `git revert` non può rimediare, ed è l'unica che il
piano tratta come vincolante.

---

## Struttura file — cosa nasce, cosa muore

| Destino | File | Perché |
|---|---|---|
| **Nasce** | `lib/orarioRoma.ts` + `lib/orarioRoma.test.ts` | `partiRoma` è usata da 5 endpoint vivi: deve stare fuori da `lib/agente/` |
| **Nasce** | `lib/produzione/comuniMassive.test.ts` | oggi non c'è test; la riduzione a una fonte va provata, non dichiarata |
| **Nasce** | `lib/__tests__/agenteRitirato.test.ts` | la guardia: nessun filo attaccato |
| **Nasce** | `supabase/migrations/20260805090000_ritiro_agente.sql` | drop delle 5 tabelle — si applica **a mano, dopo il deploy** |
| **Cambia** | `lib/produzione/comuniMassive.ts` | una fonte sola (il registro), via `daMaster()` |
| **Cambia** | `lib/acea/comuniMassive.ts` | solo il commento: l'agente non è più «da spegnere», è spento |
| **Cambia** | `components/modules/performance/PerformanceEconomica.tsx` | via i bottoni «Allinea master» |
| **Cambia** | `components/layout/NovitaCenter.tsx` | via l'annuncio «Controllo esiti DB ↔ ACEA» |
| **Cambia** | `lib/moduleAccess.ts` | via le chiavi `agente` e `assegnazione-ai` |
| **Cambia** | `lib/produzione/excelInject.ts` | il commento punta a un file che non esisterà |
| **Cambia** | `vitest.config.ts` | via l'env `LIMSYNC_WATCH_STATE` |
| **Cambia** | `tsconfig.json` | via l'exclude `tools` |
| **Cambia** | `AGENTS.md` | §8 (lista moduli) e §14 (comune-è-il-master, allineamento, tools) |
| **Muore** | `lib/agente/` (39 file, meno `orarioRoma`) | |
| **Muore** | `app/hub/agente/`, `components/modules/agente/` | modulo Agente |
| **Muore** | `app/hub/assegnazione-ai/`, `components/modules/assegnazione-ai/` | modulo Assegnazione AI |
| **Muore** | `app/api/agente/` (4 rotte) | il canale che l'agente interrogava |
| **Muore** | `app/api/admin/agente/` (15 rotte) | i comandi dell'ufficio verso l'agente |
| **Muore** | `tools/limitazioni-sync/` (73 file tracciati) | l'agente stesso |
| **Muore** | `.claude/hooks/guard-acea.mjs` | proteggeva file che non esisteranno |
| **Muore** | `lib/__tests__/moduleAccess.agente.test.ts`, `…assegnazione-ai.test.ts` | provano moduli che non ci sono più |

---

## Task 1 — `partiRoma` esce da `lib/agente`

`lib/agente/orarioRoma.ts` non è roba dell'agente: `partiRoma` dice che ora è a Roma, e la
chiamano **cinque endpoint vivi** di ACEA e AcquaLatina. Se la cartella sparisse prima, sparirebbe
con lei. Questo task è il prerequisito di tutto il resto.

**Files:**
- Create: `lib/orarioRoma.ts` (spostato), `lib/orarioRoma.test.ts` (spostato)
- Delete: `lib/agente/orarioRoma.ts`, `lib/agente/orarioRoma.test.ts`
- Modify: `app/api/acea/import/route.ts:20`, `app/api/acea/operatori/route.ts:4`,
  `app/api/acea/ordini/route.ts:11`, `app/api/acea/pianifica/route.ts:18`,
  `app/api/acqualatina/ordini/sync/route.ts:5`, `app/api/agente/tick/route.ts:5`,
  `app/hub/agente/page.tsx:7`

**Interfaces:**
- Produces: `partiRoma(now: Date): PartiRoma` e `type PartiRoma = { oggi: string; oraCorrente: string; weekday: number }` da `@/lib/orarioRoma`. Comportamento **identico**: questo task sposta, non cambia.

> Nota: `app/api/agente/tick/route.ts` e `app/hub/agente/page.tsx` moriranno nei Task 4 e 5.
> Si aggiornano lo stesso — una riga a testa — così `npx tsc --noEmit` resta pulito a ogni commit.

- [ ] **Step 1: Sposta sorgente e test con `git mv`**

```bash
git mv lib/agente/orarioRoma.ts lib/orarioRoma.ts
git mv lib/agente/orarioRoma.test.ts lib/orarioRoma.test.ts
```

- [ ] **Step 2: Verifica che l'albero sia ROTTO (è il rosso di questo task)**

```bash
npx tsc --noEmit
```

Atteso: FALLISCE con `Cannot find module '@/lib/agente/orarioRoma'` su **7 file**. Se ne elenca
di più, fermati e segnalalo: significa che c'è un importatore che questo piano non conosce.

- [ ] **Step 3: Aggiorna i 7 import**

In ognuno dei sette file, sostituisci la riga di import. Il testo cambia solo nel percorso:

```ts
// prima
import { partiRoma } from '@/lib/agente/orarioRoma';
// dopo
import { partiRoma } from '@/lib/orarioRoma';
```

In `app/hub/agente/page.tsx` la riga importa **due** simboli da moduli diversi; lì la riga da
cambiare è solo quella di `orarioRoma` (riga 7), non quella di `decisione` (riga 6).

- [ ] **Step 4: Correggi il riferimento relativo dentro il test spostato**

`lib/orarioRoma.test.ts` importa `from './orarioRoma'`: il percorso relativo resta valido dopo lo
spostamento (sorgente e test si sono mossi insieme). Verificalo leggendo la riga 2 — deve essere:

```ts
import { partiRoma } from './orarioRoma';
```

- [ ] **Step 5: Verde su tipi e test**

```bash
npx tsc --noEmit
```

Atteso: nessun errore.

```bash
npx vitest run lib/orarioRoma.test.ts
```

Atteso: PASS, 6 test.

- [ ] **Step 6: Commit**

```bash
git add lib/orarioRoma.ts lib/orarioRoma.test.ts app/api/acea app/api/acqualatina app/api/agente app/hub/agente lib/agente
git commit -m "refactor(orario): partiRoma esce da lib/agente, la usano cinque endpoint vivi"
```

---

## Task 2 — Produzione economica: una fonte sola per i comuni massive

`caricaComuniMassive()` unisce oggi due fonti: il registro `acea_ordini` e i file master
scansionati dall'agente (`agente_file_colonne`). Sui dati veri il registro ne conosce **cinque**
contro i **due** dei master: togliere la seconda fonte non toglie un comune. Il commento nel file
prevedeva già questo giorno.

**Files:**
- Modify: `lib/produzione/comuniMassive.ts`
- Modify: `lib/acea/comuniMassive.ts` (solo il commento in testa)
- Modify: `AGENTS.md` (§14, «Il comune È il file master»)
- Test: `lib/produzione/comuniMassive.test.ts` (nuovo)

**Interfaces:**
- Consumes: `comuniMassiveDaRegistro(righe: readonly RigaComune[]): string[]` e `type RigaComune = { famiglia: string | null; comune: string | null }` da `@/lib/acea/comuniMassive`; `normalizzaAttivita(tipo): { key: string; etichetta: string } | null` da `./normalizzaAttivita`.
- Produces: `caricaComuniMassive(): Promise<Set<string>>` — firma **invariata**. Cambia solo da dove prende i dati.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `lib/produzione/comuniMassive.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

/*
  Fake minimo di Supabase: regge la sola catena usata da `comuniMassive.ts`
  (`from(t).select(...).eq(col, val)`). `tabelleLette` è il punto del test: dopo il ritiro
  dell'agente questo file deve leggere UNA tabella sola, e un fake che registra i nomi lo
  dimostra senza dover leggere il sorgente con una regex.
*/
type Riga = Record<string, unknown>;
let righe: Riga[] = [];
let tabelleLette: string[] = [];

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (t: string) => {
      tabelleLette.push(t);
      return {
        select: () => ({
          eq: (col: string, val: unknown) =>
            Promise.resolve({ data: righe.filter((r) => r[col] === val), error: null }),
        }),
      };
    },
  },
}));

const { caricaComuniMassive } = await import('./comuniMassive');

const massive = (comune: string): Riga => ({ famiglia: 'massive', comune });

beforeEach(() => {
  righe = [];
  tabelleLette = [];
});

describe('caricaComuniMassive — una fonte sola dopo il ritiro dell\'agente', () => {
  it('i comuni arrivano dal registro degli ordini, normalizzati in chiave', async () => {
    righe = [massive('ZAGAROLO'), massive('LABICO'), massive('RIGNANO FLAMINIO')];
    const set = await caricaComuniMassive();
    expect([...set].sort()).toEqual(['LABICO', 'RIGNANO FLAMINIO', 'ZAGAROLO']);
  });

  it('NON legge più i file master dell\'agente: una sola tabella interrogata', async () => {
    righe = [massive('ZAGAROLO')];
    await caricaComuniMassive();
    expect(tabelleLette).toEqual(['acea_ordini']);
    expect(tabelleLette).not.toContain('agente_file_colonne');
  });

  it('registro vuoto → insieme vuoto: nessun comune trattato come speciale', async () => {
    righe = [];
    expect((await caricaComuniMassive()).size).toBe(0);
  });

  it('la query filtra per famiglia: il dunning non porta comuni nel set', async () => {
    righe = [massive('ZAGAROLO'), { famiglia: 'dunning', comune: 'ROMA' }];
    const set = await caricaComuniMassive();
    expect([...set]).toEqual(['ZAGAROLO']);
  });
});
```

- [ ] **Step 2: Lancia il test e guardalo fallire**

```bash
npx vitest run lib/produzione/comuniMassive.test.ts
```

Atteso: FAIL sul secondo test — `tabelleLette` contiene anche `agente_file_colonne`.

- [ ] **Step 3: Riduci `comuniMassive.ts` a una fonte**

Sostituisci **l'intero contenuto** di `lib/produzione/comuniMassive.ts` con:

```ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { comuniMassiveDaRegistro, type RigaComune } from '@/lib/acea/comuniMassive';
import { normalizzaAttivita } from './normalizzaAttivita';

// I comuni delle "limitazioni massive" alimentano attivitaCanonica, che decide in modo
// data-driven quali righe acea-senza-testo sono massive (nessun comune hardcoded).
//
// UNA fonte: il REGISTRO `acea_ordini`, i comuni con almeno un ordine di famiglia 'massive'.
// Si aggiorna a ogni import del modulo ACEA.
//
// C'era una seconda fonte — i file master scansionati dall'agente Playwright
// (`agente_file_colonne.is_master`) — ed è sparita col ritiro dell'agente (2026-08-04). Non ha
// portato via niente: sui dati veri il registro conosceva CINQUE comuni massive contro i DUE
// master esistenti.

/** Comuni massive dal registro degli ordini. Lista vuota se il registro non è leggibile. */
async function daRegistro(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('acea_ordini')
    .select('famiglia, comune')
    .eq('famiglia', 'massive');
  // Registro non leggibile: degrado coerente, nessun comune trattato come speciale.
  if (error) return [];
  return comuniMassiveDaRegistro((data ?? []) as RigaComune[]);
}

/**
 * Insieme delle CHIAVI normalizzate (normalizzaAttivita) dei comuni massive, pronte per il
 * confronto in attivitaCanonica. Set vuoto se il registro è vuoto.
 */
export async function caricaComuniMassive(): Promise<Set<string>> {
  const set = new Set<string>();
  for (const c of await daRegistro()) {
    const k = normalizzaAttivita(c)?.key ?? '';
    if (k) set.add(k);
  }
  return set;
}
```

- [ ] **Step 4: Il test passa**

```bash
npx vitest run lib/produzione/comuniMassive.test.ts
```

Atteso: PASS, 4 test.

- [ ] **Step 5: Aggiorna il commento di `lib/acea/comuniMassive.ts`**

Il file spiega perché esiste al futuro («Spegnendo l'agente quella fonte si congela»). Ora è
passato. Sostituisci le righe 4–13 (il blocco `// PERCHÉ ESISTE` fino a `nessuna riclassificazione
a sorpresa.`) con:

```ts
// PERCHÉ ESISTE. `attivitaCanonica` decide se una riga ACEA senza testo attività è massiva o va
// riclassificata Italgas (AGENTS.md §14), e per farlo ha bisogno dell'elenco dei comuni massive.
// Fino al 04/08/2026 quell'elenco veniva dai file MASTER scansionati dall'agente Playwright
// (`agente_file_colonne.is_master`: LABICO.xlsx → LABICO): una fonte che con l'agente spento si
// sarebbe congelata, e un comune nuovo sarebbe stato classificato male in silenzio.
//
// Il registro sa la stessa cosa e la sa meglio: i comuni delle righe `famiglia = 'massive'`.
// Verificato prima del passaggio: il registro ne conosceva CINQUE contro i DUE master esistenti,
// quindi il cambio di fonte non ha tolto nulla né allargato il set a sorpresa.
```

- [ ] **Step 6: Aggiorna AGENTS.md §14**

Sostituisci il paragrafo «### Il comune È il file master» (righe 391–395) con:

```markdown
### Il comune viene dal REGISTRO
I comuni massive = i comuni con almeno un ordine `famiglia = 'massive'` in `acea_ordini`. Fonte
unica: `comuniMassiveDaRegistro()` (`lib/acea/comuniMassive.ts`) e, lato Produzione economica,
`caricaComuniMassive()` (`lib/produzione/comuniMassive.ts`). **Aggiungere un comune = importarne
gli ordini dal modulo ACEA**, nessuna modifica al codice.
Fino al 04/08/2026 la fonte erano i file master scansionati dall'agente Playwright; è sparita col
ritiro dell'agente.
```

- [ ] **Step 7: Verde su tipi e suite**

```bash
npx tsc --noEmit
```

Atteso: nessun errore.

```bash
npm test
```

Atteso: suite verde.

- [ ] **Step 8: Commit**

```bash
git add lib/produzione/comuniMassive.ts lib/produzione/comuniMassive.test.ts lib/acea/comuniMassive.ts AGENTS.md
git commit -m "refactor(produzione): i comuni massive vengono dal registro, non piu dai master dell'agente"
```

---

## Task 3 — Via il bottone «Allinea master» dalla Produzione economica

Sono i due bottoni che *armano* un giro dell'agente (`forza_acea_stato`). Con l'agente ritirato
prometterebbero un lavoro che nessuno farà: peggio del bottone mancante è il bottone che mente.

**Files:**
- Modify: `components/modules/performance/PerformanceEconomica.tsx:105-126`, `:141-153`, `:177`
- Modify: `AGENTS.md` (§14, «Allineamento agente dalla Produzione economica»)

- [ ] **Step 1: Togli lo stato e la funzione `allinea`**

Cancella il blocco righe 105–126 per intero: il commento `// "Allinea da ACEA": …`, il
`const [allineaMsg, setAllineaMsg] = useState<string | null>(null);` e tutta la funzione
`const allinea = async (target: 'dunning' | 'TUTTI') => { … };`.

- [ ] **Step 2: Togli i bottoni, tieni il listino**

Nel blocco `{vista !== 'acqualatina' && ( … )}` (righe 143–153) restano **solo** il listino
tariffe. Sostituisci quel blocco con:

```tsx
          {/* Il listino è roba ACEA: nella vista AcquaLatina sparirebbe un comando che lì non ha
              un effetto. */}
          {vista !== 'acqualatina' && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditorOpen((v) => !v)}>
              {editorOpen ? 'Chiudi listino' : 'Listino tariffe ACEA'}
            </Button>
          )}
```

Sparisce anche il separatore verticale (`<span className="mx-1 h-4 w-px …" aria-hidden />`):
separava i bottoni dell'agente dal listino, e senza i primi non separa più niente.

- [ ] **Step 3: Togli la riga di messaggio**

Cancella la riga 177:

```tsx
      {allineaMsg && <p className="mb-2 text-xs text-[var(--brand-text-muted)]">{allineaMsg}</p>}
```

- [ ] **Step 4: Aggiorna AGENTS.md §14**

Sostituisci l'intero paragrafo «### Allineamento agente dalla Produzione economica» (righe
408–415) con:

```markdown
### Niente comandi verso l'agente (ritirato il 04/08/2026)
La Produzione economica non arma più giri: i bottoni «Allinea master: Dunning / Limitazioni
massive» sono spariti con l'agente Playwright. I dati arrivano dall'**import del modulo ACEA**,
che porta il file nuovo e completo a ogni giro. **Non reintrodurre** bottoni di allineamento.
```

- [ ] **Step 5: Verde su tipi, lint del file, suite**

```bash
npx tsc --noEmit
```

Atteso: nessun errore. In particolare **nessun** `'useState' is declared but never read` — la
pagina usa `useState` anche per `editorOpen`, quindi l'import resta legittimo.

```bash
npx eslint components/modules/performance/PerformanceEconomica.tsx
```

Atteso: nessun errore **nuovo** rispetto alla baseline del file.

```bash
npm test
```

Atteso: suite verde.

- [ ] **Step 6: Commit**

```bash
git add components/modules/performance/PerformanceEconomica.tsx AGENTS.md
git commit -m "chore(produzione): via i bottoni che armavano i giri dell'agente"
```

---

## Task 4 — Via i moduli Agente e Assegnazione AI

I due moduli sono intrecciati (`assegnazione-ai` importa `StoricoCard` e `AvvisiSyncBanner` da
`modules/agente`): si tolgono insieme, o l'albero non compila in mezzo. Qui muore la UI; gli
endpoint che chiamava muoiono nel Task 5.

**Files:**
- Delete: `app/hub/agente/page.tsx`, `app/hub/assegnazione-ai/page.tsx`,
  `components/modules/agente/` (intera), `components/modules/assegnazione-ai/` (intera),
  `lib/__tests__/moduleAccess.agente.test.ts`, `lib/__tests__/moduleAccess.assegnazione-ai.test.ts`
- Modify: `components/layout/NovitaCenter.tsx:7`, `:30-34`, `:172`
- Modify: `lib/moduleAccess.ts:27-28`, `:43`, `:202-221`
- Modify: `AGENTS.md:164`

**Interfaces:**
- Produces: `AppModuleKey` senza `'agente'` e senza `'assegnazione-ai'`. Chi tipizza su quella union (middleware, Utenze) si adegua da solo.

- [ ] **Step 1: Cancella pagine, componenti e i due test di modulo**

```bash
git rm -r app/hub/agente app/hub/assegnazione-ai components/modules/agente components/modules/assegnazione-ai
git rm lib/__tests__/moduleAccess.agente.test.ts lib/__tests__/moduleAccess.assegnazione-ai.test.ts
```

- [ ] **Step 2: Verifica che l'albero sia ROTTO (il rosso del task)**

```bash
npx tsc --noEmit
```

Atteso: FALLISCE su `components/layout/NovitaCenter.tsx` — `Cannot find module
'@/components/modules/assegnazione-ai/AnnuncioConfrontoEsiti'`. Quello è il filo che il Novità
Center teneva attaccato al modulo.

- [ ] **Step 3: Togli l'annuncio dal Novità Center**

In `components/layout/NovitaCenter.tsx`, tre cancellazioni.

Riga 7, l'import:

```tsx
import AnnuncioConfrontoEsiti, { ANNUNCIO_CONFRONTO_ESITI_KEY } from '@/components/modules/assegnazione-ai/AnnuncioConfrontoEsiti';
```

La voce nell'array `ANNUNCI` (righe 30–34):

```tsx
  {
    key: ANNUNCIO_CONFRONTO_ESITI_KEY,
    title: 'Controllo esiti DB ↔ ACEA',
    subtitle: 'In Aggiorna stato ODL: doppia conferma dei positivi tra il nostro DB e il portale, con export Excel.',
  },
```

E la modale in fondo (riga 172):

```tsx
      <AnnuncioConfrontoEsiti open={openKey === ANNUNCIO_CONFRONTO_ESITI_KEY} onClose={chiudiModal} />
```

- [ ] **Step 4: Togli le due chiavi da `lib/moduleAccess.ts`**

Nella union `AppModuleKey`, cancella le righe 27–28:

```ts
  | 'agente'
  | 'assegnazione-ai'
```

Da `APP_MODULES`, cancella i due oggetti (righe 202–221), quello con `key: 'agente'` e quello con
`key: 'assegnazione-ai'`, virgole comprese.

E correggi il commento della riga 43, che cita `agente` come esempio di gate di ruolo (non lo era
nemmeno prima — il modulo aveva `adminOnly`, non `requiresAdminRole`):

```ts
  /** Gate FORTE di ruolo: l'accesso richiede ruolo admin. Es. `impostazioni`. */
```

- [ ] **Step 5: Aggiorna la lista moduli in AGENTS.md**

Riga 164, togli `assegnazione-ai` e `agente` dall'elenco di esempio:

```typescript
// La lista completa dei moduli (14+: dashboard, mappa, appuntamenti,
// hotel-calendar, interventi, consuntivazione, live, lista-attesa,
// misuratori, acqualatina, performance, impostazioni, …) vive in
```

- [ ] **Step 6: Verde su tipi e suite**

```bash
npx tsc --noEmit
```

Atteso: nessun errore.

```bash
npm test
```

Atteso: suite verde, con **3 file di test in meno**: i due `moduleAccess.*` cancellati allo Step 1
e `components/modules/agente/__tests__/colonneView.test.ts`, andato via con la cartella.
I test di `lib/agente/**` girano ancora (la lib muore nel Task 5) e devono restare verdi: qui non
è stata toccata.

- [ ] **Step 7: Controlla se qualche utente ha ancora le chiavi assegnate (sola lettura)**

Le chiavi possono essere rimaste in `app_metadata.allowedModules` di qualche utenza. Non è un
bug — una chiave che non esiste più semplicemente non aggancia nessuna rotta — ma va **guardato**,
non presunto. Con l'MCP Supabase, in sola lettura:

```sql
select count(*) as utenti_con_chiave_morta
from auth.users
where app_metadata->'allowedModules' ?| array['agente','assegnazione-ai'];
```

Se il conteggio è > 0, **annotalo nel report del task** e vai avanti: la pulizia dei metadati non
è in questo piano, e nessuna rotta risponde più a quelle chiavi.

- [ ] **Step 8: Commit**

```bash
git add -A app/hub components/modules components/layout/NovitaCenter.tsx lib/moduleAccess.ts lib/__tests__ AGENTS.md
git commit -m "chore(moduli): via Agente e Assegnazione AI dalla navigazione e dalla UI"
```

---

## Task 5 — Via gli endpoint e `lib/agente`

Ora che nessuna pagina li chiama, cadono i 19 endpoint e la libreria. Da qui il Playwright non può
più partire da nessuna macchina: anche se un PC dimenticato chiamasse `/api/agente/tick`, non
troverebbe nessuno.

**Files:**
- Delete: `app/api/agente/` (intera: `tick`, `report`, `pianificabili`, `acea-assegnazioni`)
- Delete: `app/api/admin/agente/` (intera: 15 rotte)
- Delete: `lib/agente/` (intera — `orarioRoma` ne è già uscita nel Task 1)

- [ ] **Step 1: Verifica che nessuno li chiami più**

```bash
grep -rn "api/agente\|api/admin/agente\|@/lib/agente/" app components lib --include=*.ts --include=*.tsx
```

Atteso: gli **unici** risultati sono dentro `app/api/agente/`, `app/api/admin/agente/` e
`lib/agente/` — cioè si citano tra loro. Più `lib/apiExportKey.ts`, che ha un commento con quei
nomi: quello si sistema allo Step 3. Se compare altro, fermati: è un chiamante che questo piano
non conosce.

- [ ] **Step 2: Cancella**

```bash
git rm -r app/api/agente app/api/admin/agente lib/agente
```

- [ ] **Step 3: Aggiorna il commento di `lib/apiExportKey.ts`**

Il file resta (lo usa `/api/export/limitazioni-massive`), ma la riga 8 cita rotte che non
esistono più. Sostituiscila con:

```ts
 * essere riusata da /api/export/limitazioni-massive.
```

- [ ] **Step 4: Verde su tipi, build e suite**

```bash
npx tsc --noEmit
```

Atteso: nessun errore.

```bash
npm test
```

Atteso: suite verde, e con **18 file di test in meno** — quelli di `lib/agente/**`, spariti con il
codice che coprivano (`orarioRoma.test.ts` non è tra questi: è uscito dalla cartella nel Task 1).
È il calo previsto: se il totale non scende, qualcosa non è stato cancellato.

```bash
npm run build
```

Atteso: build completa. È il controllo che conta davvero qui — Next risolve le rotte a build time
e una `page.tsx` che punta a una rotta morta si vede solo così.

- [ ] **Step 5: Commit**

```bash
git add -A app/api lib/agente lib/apiExportKey.ts
git commit -m "chore(agente): via gli endpoint /api/agente e /api/admin/agente e la lib"
```

---

## Task 6 — Via `tools/limitazioni-sync`

L'agente stesso: 73 file tracciati, più roba ignorata da git (`config.json` col segreto,
`node_modules`, i download di debug). Il `config.json` **non è mai stato nel repo** — è
gitignorato, e il repo è pubblico: va bene così, e va cancellato dal disco a mano.

**Files:**
- Delete: `tools/limitazioni-sync/` (intera), `.claude/hooks/guard-acea.mjs`
- Modify: `.claude/settings.local.json` (via il blocco `hooks`), `vitest.config.ts`,
  `tsconfig.json`, `lib/produzione/excelInject.ts:6`, `AGENTS.md` (§14, «tools/limitazioni-sync»)

- [ ] **Step 1: Cancella i file tracciati**

```bash
git rm -r tools/limitazioni-sync .claude/hooks/guard-acea.mjs
```

- [ ] **Step 2: Cancella dal disco anche l'ignorato**

`git rm` non tocca ciò che è gitignorato. Restano `config.json` (contiene la chiave di export e i
path SharePoint), `node_modules/`, `_acea_debug/`, `_acea_download/`, `.sync-watch.json`,
`scanColonne.stamp`.

```bash
rm -rf tools/limitazioni-sync
```

Poi verifica che la cartella `tools/` sia vuota o sparita:

```bash
ls tools 2>/dev/null; echo "uscita: $?"
```

Atteso: nessun contenuto (o directory inesistente).

- [ ] **Step 3: Togli il guard hook dalla configurazione**

`.claude/hooks/guard-acea.mjs` proteggeva i file dell'automazione di assegnazione ACEA. I file non
esistono più; se la configurazione restasse, ogni Edit lancerebbe uno script mancante.

In `.claude/settings.local.json`, cancella l'intero blocco `"hooks"` (il `PreToolUse` che invoca
`node .claude/hooks/guard-acea.mjs`), lasciando l'oggetto `"permissions"` intatto.

> ⚠️ Il file ha **altre modifiche non committate** (voci di permessi aggiunte in sessioni
> precedenti): committandolo salgono anche quelle. Sono la allowlist locale dell'utente, benigne —
> ma dichiaralo nel messaggio di commit invece di farle passare in silenzio.

- [ ] **Step 4: Togli l'env dei test lim-sync da `vitest.config.ts`**

Isolava i writer dell'agente dal loro file di stato reale. Senza agente non isola niente.
Sostituisci l'intero contenuto di `vitest.config.ts` con:

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // Mock 'server-only' so vitest (node env) non la rifiuta
      'server-only': fileURLToPath(new URL('./vitest.server-only-mock.js', import.meta.url)),
    },
  },
  esbuild: {
    // Abilita il runtime automatico JSX (React 17+) per i file .tsx importati nei test
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // `.claude/worktrees` contiene checkout git di sessioni passate: NON vanno raccolti,
    // altrimenti copie stale dei test inquinano la run (falsi rossi/verdi) e mascherano le regressioni.
    exclude: ['node_modules', '.next', '**/.claude/**'],
  },
});
```

Spariscono con l'env anche i tre import che servivano solo a lei (`mkdtempSync`, `tmpdir`, `join`).

- [ ] **Step 5: Togli l'exclude `tools` da `tsconfig.json`**

Riga 27:

```json
  "exclude": ["node_modules"]
```

- [ ] **Step 6: Sistema il puntatore morto in `excelInject.ts`**

La riga 6 rimanda a un file che non esiste più. Sostituisci le righe 4–6 con:

```ts
// Iniezione dati in un template .xlsx PRESERVANDO i grafici nativi: si riscrivono solo i valori delle
// celle (foglio "Dati"/"Dettaglio"/"Audit"), non si ri-serializza il workbook (ExcelJS perderebbe i
// grafici). Tecnica jszip-chirurgica.
```

- [ ] **Step 7: Togli il paragrafo `tools/limitazioni-sync` da AGENTS.md**

Cancella per intero il paragrafo «### tools/limitazioni-sync (agente standalone `.mjs`)» (righe
417–420, dal titolo fino a `…parsing di path Windows in questo tool.`). Il paragrafo «### Invariante»
che lo segue **resta**: parla dell'endpoint di export, che non se ne va.

- [ ] **Step 8: Verde su tipi e suite**

```bash
npx tsc --noEmit
```

Atteso: nessun errore.

```bash
npm test
```

Atteso: suite verde, con **circa 31 test-file in meno** (quelli sotto `tools/limitazioni-sync`).

- [ ] **Step 9: Commit**

```bash
git add -A tools .claude vitest.config.ts tsconfig.json lib/produzione/excelInject.ts AGENTS.md
git commit -m "chore(agente): via tools/limitazioni-sync, il guard hook e la sua env di test

Nel commit sale anche la allowlist locale di .claude/settings.local.json,
gia' modificata in working tree prima di questo lavoro."
```

---

## Task 7 — La guardia: nessun filo attaccato

Il test che si accorge se domani qualcuno reintroduce un import verso l'agente — o se oggi ne è
rimasto uno che i passi precedenti non hanno visto.

**Files:**
- Test: `lib/__tests__/agenteRitirato.test.ts` (nuovo)

- [ ] **Step 1: Scrivi la guardia**

Crea `lib/__tests__/agenteRitirato.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/*
  L'agente Playwright è stato ritirato il 04/08/2026 (spec
  docs/superpowers/specs/2026-08-04-rimozione-agente-design.md). Questo test è la guardia: un
  import verso `@/lib/agente` o un riferimento a `tools/limitazioni-sync` in un sorgente
  dell'app significa che è rimasto — o tornato — un filo attaccato a codice che non esiste.
*/
const RADICE = resolve(__dirname, '../..');
const CARTELLE = ['app', 'components', 'lib'];
// `.claude` contiene worktree di sessioni passate: sono altri checkout, non questo codice.
const SALTA = new Set(['node_modules', '.next', '.claude']);

function sorgenti(dir: string): string[] {
  const out: string[] = [];
  for (const voce of readdirSync(dir)) {
    if (SALTA.has(voce)) continue;
    const p = join(dir, voce);
    if (statSync(p).isDirectory()) out.push(...sorgenti(p));
    else if (/\.tsx?$/.test(voce)) out.push(p);
  }
  return out;
}

const file = CARTELLE.flatMap((c) => sorgenti(join(RADICE, c)));
const relativo = (f: string) => f.slice(RADICE.length + 1).replace(/\\/g, '/');

describe("l'agente Playwright è ritirato (04/08/2026)", () => {
  it('il camminatore vede davvero i sorgenti (se no, il test passerebbe a vuoto)', () => {
    // Senza questa asserzione un bug nel walker renderebbe verdi tutte le altre gratis.
    // Soglia larga apposta: i sorgenti sono ~960 dopo la rimozione, e questo numero deve
    // reggere la crescita normale del progetto senza diventare un test da aggiornare.
    expect(file.length).toBeGreaterThan(500);
  });

  it('nessun sorgente importa da lib/agente', () => {
    const colpevoli = file.filter((f) => readFileSync(f, 'utf8').includes('@/lib/agente/'));
    expect(colpevoli.map(relativo)).toEqual([]);
  });

  it('nessun sorgente nomina tools/limitazioni-sync', () => {
    const colpevoli = file.filter((f) => readFileSync(f, 'utf8').includes('tools/limitazioni-sync'));
    expect(colpevoli.map(relativo)).toEqual([]);
  });

  it('le cartelle dell\'agente non esistono più', () => {
    const cartelle = ['lib/agente', 'app/api/agente', 'app/api/admin/agente', 'tools/limitazioni-sync'];
    const rimaste = cartelle.filter((d) => existsSync(join(RADICE, d)));
    expect(rimaste).toEqual([]);
  });

  it('partiRoma sta fuori: la usano cinque endpoint vivi di ACEA e AcquaLatina', () => {
    // Il ritiro non doveva portarsi via un helper condiviso. Qui si prova che non l'ha fatto.
    expect(existsSync(join(RADICE, 'lib/orarioRoma.ts'))).toBe(true);
  });
});
```

- [ ] **Step 2: Lancialo — deve essere già verde**

```bash
npx vitest run lib/__tests__/agenteRitirato.test.ts
```

Atteso: PASS, 5 test. Se **fallisce**, è la guardia che sta facendo il suo lavoro: un task
precedente ha lasciato un riferimento. Torna a sistemarlo prima di andare avanti.

- [ ] **Step 3: Prova che la guardia sa fallire**

Un test di cancellazione che nasce verde non ha mai dimostrato niente. Rendilo rosso apposta:
aggiungi in fondo a `lib/orarioRoma.ts` la riga

```ts
// finto riferimento di prova: import da '@/lib/agente/decisione'
```

poi rilancia:

```bash
npx vitest run lib/__tests__/agenteRitirato.test.ts
```

Atteso: FAIL sul test «nessun sorgente importa da lib/agente», con `lib/orarioRoma.ts` in elenco.
**Poi togli la riga** e rilancia: PASS.

- [ ] **Step 4: Suite intera**

```bash
npm test
```

Atteso: verde.

- [ ] **Step 5: Commit**

```bash
git add lib/__tests__/agenteRitirato.test.ts
git commit -m "test(agente): guardia contro i fili lasciati attaccati all'agente ritirato"
```

---

## Task 8 — Le tabelle: export, poi drop — **DOPO il deploy**

⚠️ **Questo task non si esegue insieme agli altri.** L'ordine è la lezione del 04/08 (PR #222):
una migration distruttiva applicata prima che il codice nuovo sia in produzione lascia il codice
vecchio a leggere colonne che non ci sono più. Qui il rischio è lo stesso al rovescio: finché la
versione deployata contiene `app/hub/agente/page.tsx`, quella pagina legge `agente_config` e
`agente_run`.

**Prerequisito bloccante:** i Task 1–7 mergiati su `main` e il deploy Vercel **completato e
verificato in produzione**.

**Files:**
- Create: `supabase/migrations/20260805090000_ritiro_agente.sql`
- Create (fuori dal repo): `C:\Users\Edgardo\Desktop\backup-agente\agente_run-2026-08-04.json`

- [ ] **Step 1: Verifica che il deploy sia davvero in produzione**

Apri l'app deployata e controlla che `/hub/agente` risponda **404** e che nella sidebar non ci sia
più né «Agente» né «Assegnazione AI». Finché una delle due è viva, **fermati qui**.

- [ ] **Step 2: Esporta lo storico dei giri, fuori dal repo**

`agente_run` sono 423 giri con il report completo in `dettaglio` (jsonb): è storico operativo, e
il repo è pubblico. Va in una cartella sul Desktop, non in `docs/`.

Con l'MCP Supabase:

```sql
select id, creato_il, dry_run, lavori, aggiornate, extra, conflitti, non_collocate, errore, dettaglio
from agente_run
order by creato_il;
```

Scrivi il risultato in `C:\Users\Edgardo\Desktop\backup-agente\agente_run-2026-08-04.json`.
Se il payload è troppo grande per una sola risposta, esporta a blocchi di 100 righe con
`limit 100 offset N` e concatena — meglio quattro chiamate che un export monco.

- [ ] **Step 3: Verifica il file prima di droppare**

```bash
ls -la "/c/Users/Edgardo/Desktop/backup-agente/"
```

Atteso: il file esiste e non è vuoto. Controlla che la prima e l'ultima riga del JSON siano
coerenti (un array chiuso, 423 elementi). **Se l'export è incompleto, non proseguire**: il drop è
l'unico passo di questo piano che un `git revert` non annulla.

- [ ] **Step 4: Scrivi la migration**

Crea `supabase/migrations/20260805090000_ritiro_agente.sql`:

```sql
-- ============================================================================
-- Ritiro dell'agente Playwright — drop delle tabelle
-- Spec: docs/superpowers/specs/2026-08-04-rimozione-agente-design.md
--
-- ⚠️ DISTRUTTIVA. Si applica SOLO dopo che il codice senza l'agente è in produzione:
-- la versione precedente leggeva agente_config e agente_run dalla pagina /hub/agente.
--
-- Lo storico dei giri (agente_run, 423 righe) è stato esportato fuori dal repo prima
-- del drop: è storico operativo e questo repository è pubblico.
--
-- Niente `cascade`: se un drop fallisce per una dipendenza, quella dipendenza è
-- un'informazione che vogliamo leggere, non qualcosa da travolgere in silenzio.
-- ============================================================================

drop table if exists agente_pianificabili;
drop table if exists agente_file_colonne;
drop table if exists agente_run;
drop table if exists agente_config;
drop table if exists acea_preassegnati;
```

- [ ] **Step 5: Applica la migration**

Applicala con l'MCP Supabase (`apply_migration`), nome `ritiro_agente`.

Atteso: nessun errore. Se una `drop` fallisce citando una dipendenza (vista, foreign key,
funzione), **fermati e riportala**: significa che qualcosa punta ancora a quella tabella e va
capito prima, non forzato con `cascade`.

- [ ] **Step 6: Verifica che le tabelle siano sparite**

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('agente_config','agente_run','agente_file_colonne','agente_pianificabili','acea_preassegnati');
```

Atteso: **zero righe**.

- [ ] **Step 7: Verifica che la Produzione economica regga**

Apri il modulo Produzione economica in produzione, vista ACEA, su un range che contenga
limitazioni massive. I comuni massive devono essere ancora classificati come tali — è la prova
sul campo che il Task 2 ha retto senza la seconda fonte, ora che la tabella non esiste proprio più.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260805090000_ritiro_agente.sql
git commit -m "chore(db): drop delle tabelle dell'agente, applicata dopo il deploy"
```

---

## Note per chi esegue

**Cosa NON è in questo piano, di proposito:**

- **`/api/export/limitazioni-massive` resta in piedi.** Era il lato-app della sincronizzazione
  SharePoint e con l'agente ritirato non ha più chiamanti. Toglierlo si porterebbe dietro
  `lib/limitazione/exportLimMassive.ts`, `lib/apiExportKey.ts` e i loro test: è una pulizia a sé,
  fuori dalla spec approvata. **Segnalalo nel report finale** perché l'utente possa decidere.
- **I metadati utente** (`app_metadata.allowedModules`) con le chiavi `agente` /
  `assegnazione-ai`: si contano nel Task 4 Step 7, non si ripuliscono. Una chiave che non esiste
  più non aggancia nessuna rotta.
- **Ri-basare Assegnazione AI sul registro:** il modulo se ne va, è nella sezione «Fuori scope»
  della spec.
- **Il badge «già assegnato su ACEA»** muore con `acea_preassegnati`. Se un giorno servisse, il
  dato è nel registro (`acea_ordini.operatore_cognome`, che l'import porta): sarà una feature
  nuova, non un recupero.

**Se qualcosa non torna:** i Task 1–7 vivono su un branch e si annullano con un `git revert`. Il
Task 8 no — ed è per questo che ha un export davanti e un prerequisito bloccante sopra.
