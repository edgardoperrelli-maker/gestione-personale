# AcquaLatina — Esito in tabella e tab guidate dall'esito — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nella vista AcquaLatina la colonna Stato lascia il posto all'Esito del rapportino, e la tab segue quell'esito — SI e NO chiudono, NESSUN PASSAGGIO resta da lavorare.

**Architecture:** la regola vive in `lib/acqualatina/chiusuraRegistro.ts`, che è pura e già oggi decide la chiusura; impara a distinguere tre esiti invece di due. La route le passa l'`eseguito` della voce (che `interventi.esito` non sa esprimere) leggendolo con la stessa query che già serve `matricola_nuova`. In tabella cambia solo la definizione di colonna.

**Tech Stack:** Next.js 15 (App Router), Supabase/PostgREST, TypeScript, Vitest.

## Global Constraints

- Spec di riferimento: `docs/superpowers/specs/2026-08-04-acqualatina-esito-tab-design.md`.
- **Il positivo è intoccabile**: nessuna uscita successiva riapre una riga chiusa bene.
- **`NO` chiude solo dal `2026-08-05` in poi**, sulla `interventi.data` (giornata di lavoro, non la data del rapportino né quella di chiusura). Senza questa barriera la riconciliazione — che rigira su tutti i completati a ogni apertura della tabella — chiuderebbe anche le 9 righe storiche, che per decisione esplicita restano dove sono.
- **`NESSUN PASSAGGIO` non chiude mai**: è il caso che la decisione del 03/08 proteggeva.
- Niente backfill delle righe storiche, niente ripianificazione automatica.
- Lingua di codice, commenti e UI: italiano.
- Test: Vitest. `npx vitest run <percorso> --reporter=dot`.
- Repo **pubblico**: mai dati di produzione (matricole, ODL veri, nomi, indirizzi) in codice, test o commit.

---

### Task 1: La regola impara i tre esiti

**Files:**
- Modify: `lib/acqualatina/chiusuraRegistro.ts`
- Test: `lib/acqualatina/chiusuraRegistro.test.ts` (esiste già, si estende)

**Interfaces:**
- Consumes: niente.
- Produces:
  - `type EsitoRiga = 'positivo' | 'chiusa_non_eseguita' | 'aperta_non_eseguita'`
  - `STATO_CHIUSA_NON_ESEGUITA = 'Chiusa — non eseguita'`
  - `NO_CHIUDE_DAL = '2026-08-05'`
  - `InterventoConcluso` con il campo `eseguito?: string | null`
  - `esitoRiga(c: InterventoConcluso): EsitoRiga`
  - `gruppiChiusura(conclusi): Array<{ esito: EsitoRiga; ids: string[]; patch: PatchRiga }>`

- [ ] **Step 1: Scrivi i test nuovi**

In coda a `lib/acqualatina/chiusuraRegistro.test.ts`:

```ts
import { NO_CHIUDE_DAL, STATO_CHIUSA_NON_ESEGUITA, esitoRiga, gruppiChiusura } from './chiusuraRegistro';

describe('i tre esiti del rapportino', () => {
  const base = { ordine_id: 'o1', data: '2026-08-10' };

  it('SI chiude la riga come eseguita', () => {
    expect(esitoRiga({ ...base, esito: 'eseguito_positivo', eseguito: 'SI' })).toBe('positivo');
  });

  it('NO chiude la riga, ma come NON eseguita', () => {
    // Su questa commessa il NO e` definitivo: il contatore non c'e` piu`, l'impianto e` dismesso,
    // l'utente rifiuta. Tenerlo in coda sarebbe rumore su lavoro che nessuno fara`.
    expect(esitoRiga({ ...base, esito: null, eseguito: 'NO' })).toBe('chiusa_non_eseguita');
  });

  it('NESSUN PASSAGGIO NON chiude: e` un giro che non c e` stato', () => {
    // E` il caso che la decisione del 03/08 proteggeva: il contatore e` ancora li` da sostituire.
    expect(esitoRiga({ ...base, esito: null, eseguito: 'NESSUN PASSAGGIO' }))
      .toBe('aperta_non_eseguita');
  });

  it('nessuna risposta lascia la riga aperta', () => {
    expect(esitoRiga({ ...base, esito: null, eseguito: null })).toBe('aperta_non_eseguita');
    expect(esitoRiga({ ...base, esito: null, eseguito: '  ' })).toBe('aperta_non_eseguita');
  });

  it('il positivo vince sulla risposta scritta nella voce', () => {
    // Se l'intervento e` chiuso positivo, la riga e` fatta: una voce che dice altro e` un residuo.
    expect(esitoRiga({ ...base, esito: 'eseguito_positivo', eseguito: 'NO' })).toBe('positivo');
  });

  it('tollera spazi e minuscole nella risposta', () => {
    expect(esitoRiga({ ...base, esito: null, eseguito: ' no ' })).toBe('chiusa_non_eseguita');
    expect(esitoRiga({ ...base, esito: null, eseguito: 'nessun passaggio' }))
      .toBe('aperta_non_eseguita');
  });
});

describe('la data di taglio protegge le righe storiche', () => {
  it('un NO PRIMA del taglio non chiude', () => {
    // La riconciliazione rigira su TUTTI i completati a ogni apertura della tabella: senza
    // barriera chiuderebbe anche le 9 righe gia` esitate NO, che restano dove sono per decisione.
    expect(esitoRiga({ ordine_id: 'o1', data: '2026-07-29', esito: null, eseguito: 'NO' }))
      .toBe('aperta_non_eseguita');
  });

  it('un NO NEL giorno del taglio chiude', () => {
    expect(esitoRiga({ ordine_id: 'o1', data: NO_CHIUDE_DAL, esito: null, eseguito: 'NO' }))
      .toBe('chiusa_non_eseguita');
  });

  it('un NO senza data non chiude: senza giorno non si sa da che parte del taglio sta', () => {
    expect(esitoRiga({ ordine_id: 'o1', data: null, esito: null, eseguito: 'NO' }))
      .toBe('aperta_non_eseguita');
  });
});

describe('gruppiChiusura con i tre esiti', () => {
  it('raggruppa per giorno ed esito, e scrive lo stato che compete a ciascuno', () => {
    const gruppi = gruppiChiusura([
      { ordine_id: 'a', data: '2026-08-10', esito: 'eseguito_positivo', eseguito: 'SI' },
      { ordine_id: 'b', data: '2026-08-10', esito: null, eseguito: 'NO' },
      { ordine_id: 'c', data: '2026-08-10', esito: null, eseguito: 'NESSUN PASSAGGIO' },
    ]);
    const perEsito = Object.fromEntries(gruppi.map((g) => [g.esito, g]));
    expect(perEsito.positivo.patch.aperto).toBe(false);
    expect(perEsito.chiusa_non_eseguita.patch.aperto).toBe(false);
    expect(perEsito.chiusa_non_eseguita.patch.stato_desc).toBe(STATO_CHIUSA_NON_ESEGUITA);
    expect(perEsito.chiusa_non_eseguita.patch.esito_positivo).toBe(false);
    expect(perEsito.aperta_non_eseguita.patch.aperto).toBe(true);
  });

  it('la riga chiusa NON eseguita porta la data dell uscita', () => {
    // L'uscita c'e` stata, ed e` quella che ha chiuso la partita: la colonna «Chiusa il» ha un
    // giorno da mostrare. Sulla riga che resta APERTA no, perche' non e` chiusa.
    const [g] = gruppiChiusura([
      { ordine_id: 'a', data: '2026-08-10', esito: null, eseguito: 'NO' },
    ]);
    expect(g.patch.data_completamento).toBe('2026-08-10');
    const [g2] = gruppiChiusura([
      { ordine_id: 'b', data: '2026-08-10', esito: null, eseguito: 'NESSUN PASSAGGIO' },
    ]);
    expect(g2.patch.data_completamento).toBeNull();
  });

  it('a parita` di giorno il positivo si applica per ULTIMO', () => {
    // Su un ordine con piu` uscite l'ultima parola deve restare al lavoro fatto, non all'ordine
    // in cui una Map capita di essere percorsa.
    const gruppi = gruppiChiusura([
      { ordine_id: 'a', data: '2026-08-10', esito: 'eseguito_positivo', eseguito: 'SI' },
      { ordine_id: 'a', data: '2026-08-10', esito: null, eseguito: 'NO' },
    ]);
    expect(gruppi[gruppi.length - 1].esito).toBe('positivo');
  });

  it('scarta gli interventi senza ordine agganciato', () => {
    expect(gruppiChiusura([{ ordine_id: null, data: '2026-08-10', esito: null, eseguito: 'NO' }]))
      .toEqual([]);
  });
});
```

- [ ] **Step 2: Lancia i test e verifica che FALLISCANO**

Run: `npx vitest run lib/acqualatina/chiusuraRegistro.test.ts --reporter=dot`
Expected: FAIL — `esitoRiga is not a function`

- [ ] **Step 3: Estendi il tipo e aggiungi il quarto stato**

In `lib/acqualatina/chiusuraRegistro.ts`, sostituisci il tipo `InterventoConcluso`:

```ts
/** Un intervento della commessa già chiuso dall'operatore, come lo legge la route. */
export type InterventoConcluso = {
  /** `acqualatina_ordini.id`: il collegamento che la pianificazione scrive alla creazione. */
  ordine_id: string | null;
  data: string | null;
  esito: string | null;
  /**
   * La risposta `eseguito` della VOCE di rapportino: `SI` | `NO` | `NESSUN PASSAGGIO`.
   *
   * Serve perché `interventi.esito` distingue solo il positivo da tutto il resto, e la regola di
   * questa commessa vive proprio nella differenza fra i due negativi: il NO è definitivo, il
   * «nessun passaggio» è un giro che non c'è stato.
   */
  eseguito?: string | null;
};
```

e aggiungi, sotto `STATO_APERTA_NON_ESEGUITA`:

```ts
/**
 * Riga CHIUSA senza che il lavoro sia stato fatto: l'esito `NO` della commessa.
 *
 * Su AcquaLatina il NO è definitivo — il contatore non c'è più, l'impianto è dismesso, l'utente
 * rifiuta — quindi non c'è niente da ripianificare e tenere la riga in coda è rumore. È lo stato
 * che mancava: prima una riga o era fatta, o era ancora da fare.
 */
export const STATO_CHIUSA_NON_ESEGUITA = 'Chiusa — non eseguita';

/**
 * Il `NO` chiude solo dalle uscite di questo giorno in poi.
 *
 * La riconciliazione rigira su TUTTI gli interventi completati a ogni apertura della tabella:
 * senza barriera chiuderebbe anche le righe già esitate NO prima che la regola esistesse, che per
 * decisione esplicita restano dove sono. Invecchia da sola — fra un mese non filtra più niente e
 * resta come traccia del giorno in cui la regola è cambiata.
 */
export const NO_CHIUDE_DAL = '2026-08-05';

/** Cosa diventa la riga di registro dopo un'uscita. */
export type EsitoRiga = 'positivo' | 'chiusa_non_eseguita' | 'aperta_non_eseguita';

const PATCH_CHIUSA_NON_ESEGUITA = (data: string | null): PatchRiga => ({
  aperto: false,
  stato: 'CHIUSO',
  stato_desc: STATO_CHIUSA_NON_ESEGUITA,
  esito_positivo: false,
  // L'uscita c'è stata ed è quella che ha chiuso la partita: «Chiusa il» ha un giorno da mostrare.
  data_completamento: data,
});
```

- [ ] **Step 4: Scrivi la decisione**

Sempre in `chiusuraRegistro.ts`, sopra `gruppiChiusura`:

```ts
/** La risposta della voce, confrontabile: gli operatori scrivono con spazi e maiuscole loro. */
function rispostaNorm(v: string | null | undefined): string {
  return String(v ?? '').trim().toUpperCase();
}

/**
 * Cosa diventa la riga, data l'uscita.
 *
 * L'ordine dei controlli È la regola:
 *  1. il POSITIVO vince sempre, anche su una voce che dice altro (un residuo non riapre il lavoro);
 *  2. il NO chiude, ma solo dalle uscite dal giorno del taglio in poi;
 *  3. tutto il resto — «nessun passaggio», nessuna risposta, un NO troppo vecchio — lascia la riga
 *     aperta, che è il caso che la decisione del 03/08 proteggeva.
 */
export function esitoRiga(c: InterventoConcluso): EsitoRiga {
  if (c.esito === 'eseguito_positivo') return 'positivo';
  const risposta = rispostaNorm(c.eseguito);
  // Senza data non si sa da che parte del taglio sta l'uscita: non si chiude.
  if (risposta === 'NO' && (c.data ?? '') >= NO_CHIUDE_DAL) return 'chiusa_non_eseguita';
  return 'aperta_non_eseguita';
}

/** L'ordine di applicazione a parità di giorno: il positivo per ultimo, così vince lui. */
const RANGO: Record<EsitoRiga, number> = {
  aperta_non_eseguita: 0,
  chiusa_non_eseguita: 1,
  positivo: 2,
};
```

- [ ] **Step 5: Riscrivi `gruppiChiusura` sui tre esiti**

Sostituisci il tipo `GruppoChiusura` e la funzione:

```ts
export type GruppoChiusura = {
  /** Cosa diventa la riga: decide la patch e l'ordine di applicazione. */
  esito: EsitoRiga;
  /** Gli `acqualatina_ordini.id` da aggiornare con questa patch. */
  ids: string[];
  patch: PatchRiga;
};

const PATCH_PER_ESITO: Record<EsitoRiga, (data: string | null) => PatchRiga> = {
  positivo: PATCH_ESEGUITA,
  chiusa_non_eseguita: PATCH_CHIUSA_NON_ESEGUITA,
  aperta_non_eseguita: () => PATCH_NON_ESEGUITA,
};

/**
 * Gli aggiornamenti da scrivere sul registro, raggruppati per (giorno, esito).
 *
 * Un `update` per gruppo e non per riga: i giorni di campagna sono pochi, le righe tante.
 *
 * L'ordine è DETERMINISTICO — per giorno crescente, e a parità di giorno secondo `RANGO` — così su
 * un'unità con più uscite l'ultima parola resta all'uscita più recente e, a parità di giorno, al
 * lavoro fatto.
 */
export function gruppiChiusura(conclusi: readonly InterventoConcluso[]): GruppoChiusura[] {
  const gruppi = new Map<string, GruppoChiusura & { data: string | null }>();
  for (const c of conclusi) {
    if (!c.ordine_id) continue;
    const esito = esitoRiga(c);
    const k = `${c.data ?? ''}|${esito}`;
    const g = gruppi.get(k) ?? {
      esito,
      data: c.data,
      ids: [],
      patch: PATCH_PER_ESITO[esito](c.data),
    };
    g.ids.push(c.ordine_id);
    gruppi.set(k, g);
  }
  return [...gruppi.values()]
    .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '')
      || RANGO[a.esito] - RANGO[b.esito])
    .map(({ esito, ids, patch }) => ({ esito, ids, patch }));
}
```

- [ ] **Step 6: Lancia i test e verifica che PASSINO**

Run: `npx vitest run lib/acqualatina/chiusuraRegistro.test.ts --reporter=dot`
Expected: PASS — i test preesistenti del file **compresi**. Se un test vecchio rompe perché leggeva `g.positivo`, sostituisci quella lettura con `g.esito === 'positivo'`: il campo booleano non esiste più.

- [ ] **Step 7: Commit**

```bash
git add lib/acqualatina/chiusuraRegistro.ts lib/acqualatina/chiusuraRegistro.test.ts
git commit -m "feat(acqualatina): la chiusura distingue NO da NESSUN PASSAGGIO"
```

---

### Task 2: La route passa l'esito della voce

**Files:**
- Modify: `app/api/acea/ordini/route.ts` (`chiudiOrdiniAcqualatinaCompletati`, righe ~335-381)
- Test: `lib/acqualatina/chiusuraRouteShape.test.ts` (nuovo)

**Interfaces:**
- Consumes: `gruppiChiusura`, `GruppoChiusura`, `InterventoConcluso` dal Task 1.
- Produces: la riconciliazione scrive i tre stati.

- [ ] **Step 1: Scrivi il test di forma**

`lib/acqualatina/chiusuraRouteShape.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(
  resolve(__dirname, '../../app/api/acea/ordini/route.ts'),
  'utf8',
);
/** Il sorgente senza commenti: qui si controlla il codice, non le spiegazioni. */
const codice = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('la riconciliazione AcquaLatina legge la voce', () => {
  it("chiede l'esito scritto nel rapportino, non solo quello dell'intervento", () => {
    // `interventi.esito` distingue solo il positivo da tutto il resto: da li` la regola nuova
    // non e` esprimibile.
    const fn = codice.match(/async function chiudiOrdiniAcqualatinaCompletati[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn).not.toBe('');
    expect(fn).toMatch(/rapportino_voci/);
    expect(fn).toMatch(/eseguito/);
  });

  it('la guardia protegge SOLO il positivo', () => {
    // Il vecchio ramo negativo riapriva le righe con esito_positivo=false E aperto=false: con la
    // regola nuova quella e` la combinazione di una riga chiusa dal NO, e la guardia la
    // riaprirebbe a ogni giro.
    const fn = codice.match(/async function chiudiOrdiniAcqualatinaCompletati[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn).toMatch(/not\('esito_positivo', 'is', true\)/);
    expect(fn).not.toMatch(/aperto\.is\.false/);
  });

  it('resta best-effort: la lettura delle voci non puo` far cadere la tabella', () => {
    const fn = codice.match(/async function chiudiOrdiniAcqualatinaCompletati[\s\S]*?\n\}/)?.[0] ?? '';
    expect(fn).toMatch(/catch/);
  });
});
```

- [ ] **Step 2: Lancia il test e verifica che FALLISCA**

Run: `npx vitest run lib/acqualatina/chiusuraRouteShape.test.ts --reporter=dot`
Expected: FAIL — `rapportino_voci` non compare dentro la funzione

- [ ] **Step 3: Leggi l'esito delle voci e passalo alla regola**

In `app/api/acea/ordini/route.ts`, sostituisci il corpo di `chiudiOrdiniAcqualatinaCompletati` (dalla riga `const completati: InterventoConcluso[] = [];` fino alla chiusura della funzione):

```ts
  /*
    Gli interventi conclusi, e l'`id` di ciascuno accanto — serve a ripescare la risposta della
    sua voce. `completati` e `idInterventi` si riempiono nello STESSO ciclo e restano allineati
    per indice: un aggancio per posizione costruito in un punto solo, non ricostruito dopo.
  */
  const completati: InterventoConcluso[] = [];
  const idInterventi: string[] = [];
  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('id, ordine_id, data, esito')
      .eq('committente', 'acqualatina')
      .eq('stato', 'completato')
      .not('ordine_id', 'is', null)
      .range(offset, offset + PAGINA_SCAN - 1);
    if (error) throw error;
    const blocco = (data ?? []) as Array<InterventoConcluso & { id: string }>;
    for (const i of blocco) {
      completati.push({ ordine_id: i.ordine_id, data: i.data, esito: i.esito });
      idInterventi.push(i.id);
    }
    if (blocco.length < PAGINA_SCAN) break;
  }
  if (completati.length === 0) return;

  /*
    L'esito SCRITTO NELLA VOCE, per gli interventi appena letti.

    `interventi.esito` distingue solo il positivo da tutto il resto: NO e NESSUN PASSAGGIO gli
    arrivano identici, e la regola di questa commessa vive proprio in quella differenza. La
    risposta vera sta in `rapportino_voci.risposte.eseguito`, la stessa che la tabella mostra
    in colonna.

    Best-effort: se la lettura salta si resta alla regola vecchia (solo il positivo chiude) invece
    di far fallire la riconciliazione — una riga chiusa in ritardo si recupera al giro dopo, una
    tabella che non si apre no.
  */
  const eseguitoPerIntervento = new Map<string, string>();
  try {
    for (let i = 0; i < idInterventi.length; i += 200) {
      const { data, error } = await supabaseAdmin
        .from('rapportino_voci')
        .select('intervento_id, risposte')
        .in('intervento_id', idInterventi.slice(i, i + 200));
      if (error) throw error;
      for (const v of (data ?? []) as Array<{ intervento_id: string | null; risposte: Record<string, unknown> | null }>) {
        if (!v.intervento_id || eseguitoPerIntervento.has(v.intervento_id)) continue;
        const risposta = String((v.risposte ?? {})['eseguito'] ?? '').trim();
        if (risposta !== '') eseguitoPerIntervento.set(v.intervento_id, risposta);
      }
    }
  } catch (e) {
    console.error('[acea/ordini] esiti delle voci non letti, chiusura sul solo positivo:', e);
  }

  const conEsito: InterventoConcluso[] = completati.map((c, i) => ({
    ...c,
    eseguito: eseguitoPerIntervento.get(idInterventi[i]) ?? null,
  }));

  for (const g of gruppiChiusura(conEsito)) {
    for (let i = 0; i < g.ids.length; i += 200) {
      /*
        UNA guardia sola: non contraddire il positivo, che è definitivo.

        Il vecchio ramo negativo riapriva le righe `esito_positivo=false AND aperto=false` — la
        riparazione delle 12 righe del 03/08, che ha già fatto il suo lavoro. Con la regola nuova
        quella combinazione è una riga chiusa dal NO, e riaprirla a ogni giro metterebbe le due
        regole a rincorrersi.

        Le poche righe negative si riscrivono a ogni riconciliazione con gli stessi valori: è una
        `update` a vuoto su una decina di righe al minuto, e vale il prezzo di far vincere sempre
        l'ultima uscita invece di dover indovinare quali righe hanno già lo stato giusto.
      */
      const { error } = await supabaseAdmin
        .from('acqualatina_ordini')
        .update(g.patch)
        .in('id', g.ids.slice(i, i + 200))
        .not('esito_positivo', 'is', true);
      if (error) throw error;
    }
  }
}
```

- [ ] **Step 4: Lancia il test e verifica che PASSI**

Run: `npx vitest run lib/acqualatina/chiusuraRouteShape.test.ts --reporter=dot`
Expected: PASS (3 test)

- [ ] **Step 5: Verifica che il progetto compili**

Run: `npx tsc --noEmit`
Expected: nessun errore fuori da `.next/types`

- [ ] **Step 6: Commit**

```bash
git add app/api/acea/ordini/route.ts lib/acqualatina/chiusuraRouteShape.test.ts
git commit -m "feat(acqualatina): la riconciliazione legge l'esito dal rapportino"
```

---

### Task 3: La colonna Esito in tabella

**Files:**
- Modify: `lib/acea/colonneTabella.ts` (`COLONNE_ACQUALATINA`)
- Modify: `app/api/acea/ordini/route.ts` (`const serveEseguito`)
- Test: `lib/acea/colonneAcqualatinaShape.test.ts` (nuovo)

**Interfaces:**
- Consumes: `RigaTabella.eseguito` (campo già esistente), `SegnoEseguito` (già in `TabellaOrdini`).
- Produces: la vista AcquaLatina mostra «Esito» al posto di «Stato».

- [ ] **Step 1: Scrivi il test di forma**

`lib/acea/colonneAcqualatinaShape.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLONNE_ACQUALATINA } from './colonneTabella';

describe('vista AcquaLatina: Esito al posto di Stato', () => {
  it("la colonna «Stato» non c'e` piu`", () => {
    expect(COLONNE_ACQUALATINA.find((c) => c.chiave === 'stato')).toBeUndefined();
  });

  it('c e` «Esito», ed e` predefinita', () => {
    const c = COLONNE_ACQUALATINA.find((x) => x.chiave === 'eseguito');
    expect(c).toBeDefined();
    expect(c?.intestazione).toBe('Esito');
    expect(c?.predefinita).toBe(true);
  });

  it("non porta l'imbuto, e non e` una dimenticanza", () => {
    // Il valore non sta nel registro ma nelle risposte dei rapportini: un filtro che agisse sulle
    // sole righe caricate direbbe una bugia sul conteggio. Stessa scelta di «Eseguito» nelle
    // massive.
    const c = COLONNE_ACQUALATINA.find((x) => x.chiave === 'eseguito');
    expect(c?.filtro).toBeUndefined();
  });
});

describe('la route accende l esito anche per AcquaLatina', () => {
  const route = readFileSync(
    resolve(__dirname, '../../app/api/acea/ordini/route.ts'),
    'utf8',
  );

  it("l'estrattore vale per massive E acqualatina", () => {
    // Nessuna query in piu`: e` la stessa lettura che gia` serve `matricola_nuova` alla vista
    // AcquaLatina, con un estrattore acceso in piu`.
    expect(route).toMatch(/const serveEseguito = f\.famiglia === 'massive' \|\| acqua;/);
  });
});
```

- [ ] **Step 2: Lancia il test e verifica che FALLISCA**

Run: `npx vitest run lib/acea/colonneAcqualatinaShape.test.ts --reporter=dot`
Expected: FAIL — la colonna `stato` esiste ancora

- [ ] **Step 3: Sostituisci la colonna**

In `lib/acea/colonneTabella.ts`, dentro `COLONNE_ACQUALATINA`, sostituisci la riga

```ts
  { chiave: 'stato', intestazione: 'Stato', predefinita: true, larghezza: 175, filtro: F.stato },
```

con

```ts
  /*
    L'ESITO scritto nel rapportino, al posto dello stato che il nostro motore deriva.

    Era la colonna «Stato», e diceva «Aperta» su quasi tutte le righe: l'ufficio la guardava per
    sapere com'è finita un'uscita e non lo trovava lì. Qui c'è la risposta di chi ci è andato —
    `SI`, `NO`, `NESSUN PASSAGGIO` — la stessa che le tab ora seguono.

    Senza imbuto, e non è una dimenticanza: il valore non sta nel registro ma nelle risposte, e un
    filtro sulle sole righe caricate direbbe una bugia sul conteggio (stessa scelta di «Eseguito»
    nelle massive). La distinzione grossa — fatto / da fare — la danno le tab.
  */
  { chiave: 'eseguito', intestazione: 'Esito', predefinita: true, larghezza: 175 },
```

- [ ] **Step 4: Accendi l'estrattore per AcquaLatina**

In `app/api/acea/ordini/route.ts`, sostituisci

```ts
    const serveEseguito = f.famiglia === 'massive';
```

con

```ts
    // Anche AcquaLatina: la sua colonna «Esito» è questa. Non costa una query — la lettura di
    // `rapportino_voci` per quella vista parte già, per `matricola_nuova`.
    const serveEseguito = f.famiglia === 'massive' || acqua;
```

- [ ] **Step 5: Lancia i test e verifica che PASSINO**

Run: `npx vitest run lib/acea/colonneAcqualatinaShape.test.ts --reporter=dot`
Expected: PASS (4 test)

- [ ] **Step 6: Guardalo nel browser**

Avvia il preview (`preview_start`, config `gestione-personale`) e apri `/hub/acqualatina/pianificazione`.

Attesi: intestazione **Esito** al posto di Stato; le righe mai lavorate mostrano `—`; le righe della tab *Chiusi* mostrano `SI`; nessun imbuto sull'intestazione Esito; nessun errore in console.

- [ ] **Step 7: Commit**

```bash
git add lib/acea/colonneTabella.ts app/api/acea/ordini/route.ts lib/acea/colonneAcqualatinaShape.test.ts
git commit -m "feat(acqualatina): la colonna Esito al posto di Stato"
```

---

### Task 4: Documentazione e verifica end-to-end

**Files:**
- Modify: `AGENTS.md`
- Modify: `HANDOFF.md`

**Interfaces:**
- Consumes: tutto quanto sopra.
- Produces: niente codice.

- [ ] **Step 1: Aggiorna la regola in AGENTS.md**

Nella sezione «AcquaLatina: registro gemello», dopo il paragrafo sulla cesta, aggiungi:

```markdown
### AcquaLatina: la tab segue l'ESITO del rapportino
La vista `AcquaLatina › Pianificazione` mostra la colonna **Esito** (la risposta `eseguito` della
voce: `SI` / `NO` / `NESSUN PASSAGGIO`), non lo stato derivato. E la tab la segue:

| Esito | Stato scritto | Tab |
|---|---|---|
| `SI` | `Chiusa — eseguita` | Chiusi |
| `NO` | `Chiusa — non eseguita` | Chiusi |
| `NESSUN PASSAGGIO` | `Aperta — non eseguita` | Da lavorare |

⚠️ **`NO` ≠ `NESSUN PASSAGGIO`, e la differenza è tutta la regola**: su questa commessa il NO è
definitivo (contatore non più presente, impianto dismesso, rifiuto), il «nessun passaggio» è un
giro che non c'è stato e il contatore è ancora lì. Chiudere anche quest'ultimo è l'errore del
03/08 — 12 righe di lavoro vero dichiarate concluse e non più riassegnabili.

La distinzione **non è in `interventi.esito`** (che conosce solo il positivo): la riconciliazione
legge `rapportino_voci.risposte.eseguito`. Il `NO` chiude solo dalle uscite del `2026-08-05` in
poi (`NO_CHIUDE_DAL`), barriera che protegge le righe storiche.
```

- [ ] **Step 2: Aggiungi la sessione in HANDOFF.md**

Una sezione nuova in testa, sopra l'ultima, con: cosa cambia per l'ufficio, la distinzione NO /
NESSUN PASSAGGIO, la data di taglio e il perché, e il fatto che la colonna Esito non ha l'imbuto.

- [ ] **Step 3: Prova il giro completo**

Serve un rapportino AcquaLatina aperto. Con il preview avviato:
1. Apri `/hub/acqualatina/pianificazione`, tab *Da lavorare*: annota un ODL pianificato per oggi.
2. Sul rapportino dell'operatore (`/r/<token>`) metti `eseguito = NESSUN PASSAGGIO` su quella voce
   e invia.
3. Ricarica la tabella: la riga deve mostrare **NESSUN PASSAGGIO** e restare in *Da lavorare*.
4. Ripeti con `eseguito = NO` su un'altra voce con giornata **dal 05/08**: la riga deve mostrare
   **NO** e passare in *Chiusi*.
5. Ricarica una seconda volta: la riga chiusa dal NO **non deve tornare** in *Da lavorare* — è la
   prova che la guardia vecchia non la riapre.

⚠️ Questa prova SCRIVE su dati di produzione: usa un ordine che puoi rimettere a posto, e
rimettilo a posto (`update acqualatina_ordini set aperto = true, stato_desc = 'Aperta', stato =
'APERTO', esito_positivo = null, data_completamento = null where id = '<id>'`).

- [ ] **Step 4: Suite intera e commit**

Run: `npx vitest run --reporter=dot`
Expected: tutti verdi

```bash
git add AGENTS.md HANDOFF.md
git commit -m "docs(acqualatina): l'esito del rapportino guida la tab"
git push -u origin feat/acqualatina-esito-tab
```

Poi apri la PR verso `main` spiegando: cosa cambia per l'ufficio, perché NO e NESSUN PASSAGGIO
finiscono in posti diversi, la data di taglio, e che la guardia vecchia è stata rifatta perché
avrebbe riaperto le righe chiuse dal NO.
