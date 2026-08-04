# Cesta ⟺ stato: coerenza fra i due scrittori del registro AcquaLatina — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far sì che la colonna `cesta` e la colonna `stato` di `acqualatina_misuratori_rimossi` dicano sempre la stessa cosa, qualunque dei tre scrittori le tocchi.

**Architecture:** Una funzione pura (`statoDopoCesta`) tiene la tabella di verità; `aggiornaRegistro()` la applica quando l'ufficio scrive la cesta e, all'inverso, azzera la cesta quando lo stato regredisce a «da consegnare»; la PATCH restituisce i campi che il server ha deciso da sé e il registro li fonde nella riga con un toast. Nessuna migration, nessun `CHECK`, nessun trigger: gli scrittori sono tre e stanno tutti in questo repo.

**Tech Stack:** TypeScript, Next.js App Router (route handler `PATCH`), Supabase JS (`supabaseAdmin`), React client component, Vitest.

**Spec di riferimento:** [docs/superpowers/specs/2026-08-04-acqualatina-cesta-stato-coerenza-design.md](../specs/2026-08-04-acqualatina-cesta-stato-coerenza-design.md) — leggila prima di iniziare, i §§ citati nei task sono quelli.

## Global Constraints

- **Il repo è PUBBLICO.** Nessun dato di produzione in codice, test, commit o PR: niente matricole reali, ODL, nomi di dipendenti, indirizzi, numeri di cesta osservati sul campo. Negli esempi si usano valori inventati (`'3'`, `'7'`).
- **Italiano** in commenti, nomi e messaggi UI, come tutto il resto del repo.
- **Solo `acqualatina_misuratori_rimossi`.** Il registro ACEA (`misuratori_rimossi`) non ha la colonna `cesta` e la PATCH lo respinge già con 400: quella guardia non si tocca e non deve cadere.
- **Nessuna migration.** L'invariante vive nel codice (spec §8).
- **Nessuna scrittura su dati di produzione.** La riparazione della riga incoerente esistente NON fa parte di questo piano: si decide a parte, guardando la riga, con ok esplicito dell'utente.
- **Baseline lint:** il repo parte con ~89 errori preesistenti. Non è una regressione se il conteggio non cresce; è una regressione se cresce.
- Un commit per task, con il corpo che spiega il *perché*.

---

### Task 1: La tabella di verità, pura

La regola che deve restare vera anche quando la cella della tabella verrà riscritta. Vive in un file suo e si prova senza database, come `lib/acqualatina/ceste.ts`.

**Files:**
- Create: `lib/misuratori/cestaStato.ts`
- Test: `lib/misuratori/cestaStato.test.ts`

**Interfaces:**
- Consumes: `StatoMisuratore`, `STATI_MISURATORE` da `@/types/misuratori`.
- Produces: `statoDopoCesta(statoCorrente: StatoMisuratore, cestaNuova: string | null): StatoMisuratore | null` — `null` significa «non toccare lo stato». Il chiamante normalizza `''` → `null` prima di chiamarla (lo fa già oggi in `aggiornaRegistro`).

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `lib/misuratori/cestaStato.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STATI_MISURATORE } from '@/types/misuratori';
import { statoDopoCesta } from './cestaStato';

describe('statoDopoCesta', () => {
  it('la cesta scritta su una riga da consegnare REGISTRA lo scarico', () => {
    // L'operatore ha scaricato senza dichiararlo e l'ha detto all'ufficio: la cesta sta in
    // magazzino, quindi il contatore è in deposito.
    expect(statoDopoCesta('da_consegnare_deposito', '3')).toBe('scaricato_deposito');
  });

  it('la cesta svuotata su una riga scaricata la rimanda fra quelle da scaricare', () => {
    // Il gesto «pardon, è ancora in furgone». Senza il ritorno, la riga resterebbe
    // «scaricata» senza cesta: fuori dal bacino della modale PER SEMPRE.
    expect(statoDopoCesta('scaricato_deposito', null)).toBe('da_consegnare_deposito');
  });

  it('correggere la cifra su una riga già scaricata non tocca lo stato', () => {
    // È il caso più frequente in assoluto, e deve restare a costo zero.
    expect(statoDopoCesta('scaricato_deposito', '7')).toBeNull();
  });

  it('svuotare la cesta di una riga già da consegnare non ha niente da fare', () => {
    expect(statoDopoCesta('da_consegnare_deposito', null)).toBeNull();
  });

  it('oltre lo scarico la logistica è andata avanti: nessuna scrittura la riporta indietro', () => {
    const oltre = ['verificato_deposito', 'in_consegna_committente', 'consegnato_committente'] as const;
    for (const stato of oltre) {
      expect(statoDopoCesta(stato, '4'), `${stato} + cesta`).toBeNull();
      expect(statoDopoCesta(stato, null), `${stato} senza cesta`).toBeNull();
    }
  });

  it('solo i due gradini adiacenti si muovono: il resto della lista sta fermo', () => {
    // Se domani nasce un sesto stato, il conteggio lo fa notare QUI invece che in magazzino.
    const conCesta = STATI_MISURATORE.filter((s) => statoDopoCesta(s, '1') !== null);
    const senzaCesta = STATI_MISURATORE.filter((s) => statoDopoCesta(s, null) !== null);
    expect(conCesta).toEqual(['da_consegnare_deposito']);
    expect(senzaCesta).toEqual(['scaricato_deposito']);
  });
});
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
npx vitest run lib/misuratori/cestaStato.test.ts
```

Atteso: FAIL — `Failed to resolve import "./cestaStato"`.

- [ ] **Step 3: Scrivi l'implementazione minima**

Crea `lib/misuratori/cestaStato.ts`:

```ts
import type { StatoMisuratore } from '@/types/misuratori';

/*
  L'invariante del registro AcquaLatina: `cesta` valorizzata ⟺ lo stato è almeno
  «scaricato deposito».

  Un numero di cesta è la PROVA che quel contatore è in deposito — la cesta sta in magazzino.
  Se il numero c'è, lo stato non può dire «da consegnare»; se lo stato dice «da consegnare», il
  numero non può esserci. Il flusso dell'operatore lo rispettava già (`registraScarico` scrive i
  due campi in una UPDATE sola); questa funzione è come lo rispetta l'ufficio, che invece scrive
  un campo per volta. Spec: docs/superpowers/specs/2026-08-04-acqualatina-cesta-stato-coerenza-design.md
*/

/**
 * Lo stato che la scrittura della cesta si porta dietro. `null` = non toccare lo stato.
 *
 * Si muove SOLO fra i due gradini adiacenti. Oltre `scaricato_deposito` la logistica è andata
 * avanti: correggere una cifra non deve tirare indietro una riga già verificata, e togliere un
 * numero non deve far tornare di tre gradini un misuratore già consegnato al committente.
 *
 * `cestaNuova` arriva già normalizzata — stringa piena oppure `null`, mai `''`.
 */
export function statoDopoCesta(
  statoCorrente: StatoMisuratore,
  cestaNuova: string | null,
): StatoMisuratore | null {
  if (cestaNuova !== null) {
    return statoCorrente === 'da_consegnare_deposito' ? 'scaricato_deposito' : null;
  }
  return statoCorrente === 'scaricato_deposito' ? 'da_consegnare_deposito' : null;
}
```

- [ ] **Step 4: Lancia il test e verifica che passi**

```bash
npx vitest run lib/misuratori/cestaStato.test.ts
```

Atteso: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git add lib/misuratori/cestaStato.ts lib/misuratori/cestaStato.test.ts
git commit -m "feat(misuratori): la tabella di verita' fra cesta e stato, pura

Un numero di cesta e' la prova che il contatore e' in deposito: se c'e',
lo stato non puo' dire «da consegnare». La regola sta in un file suo e si
prova senza database, come lib/acqualatina/ceste.ts - e' quella che deve
restare vera anche quando la cella della tabella verra' riscritta."
```

---

### Task 2: La PATCH d'ufficio tiene l'invariante

Le due regole server-side: la cesta muove lo stato (nei due sensi), e la regressione esplicita a «da consegnare» azzera la cesta. Più l'eco nella risposta, senza la quale il registro mostrerebbe uno stato vecchio.

**Files:**
- Modify: `lib/misuratori/registro.ts` (import in testa; blocco `'cesta' in body` a `:129-134`; risposta finale a `:140-142`)
- Test: `lib/misuratori/cestaInvarianteShape.test.ts` (create)

**Interfaces:**
- Consumes: `statoDopoCesta` da Task 1.
- Produces: la risposta della PATCH diventa `{ ok: true, stato?: StatoMisuratore, cesta?: string | null }` — i campi ci sono **solo** quando il server li ha messi in `patch`. Task 3 li consuma.

- [ ] **Step 1: Scrivi le guardie di forma che falliscono**

Crea `lib/misuratori/cestaInvarianteShape.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  L'invariante «cesta valorizzata ⟺ stato almeno scaricato_deposito» vive nel CODICE, non nel DB:
  nessun CHECK, nessun trigger (spec §8). Questi sono i guardiani di forma sui punti dove si
  potrebbe rompere di nuovo — il comportamento vero sta in cestaStato.ts, che è puro e ha i suoi
  test. Stesso mestiere di palletCellaShape.test.ts.
*/

const registro = readFileSync(resolve(__dirname, './registro.ts'), 'utf8');
const scarico = readFileSync(resolve(__dirname, '../acqualatina/scaricoMisuratori.ts'), 'utf8');

/** I commenti si tolgono PRIMA di cercare: qui si spiegano le regole citandole per esteso. */
const senzaCommenti = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe("la PATCH d'ufficio tiene l'invariante", () => {
  it('la scrittura della cesta passa da statoDopoCesta', () => {
    expect(registro).toMatch(/from '\.\/cestaStato'/);
    expect(senzaCommenti(registro)).toMatch(/statoDopoCesta\(/);
  });

  it("lo stato implicito nasce nel ramo della CESTA e non passa dal gate admin_plus", () => {
    // Chi può scrivere la cesta può disfare la propria scrittura: chiedere un admin per
    // annullare un gesto appena fatto lascerebbe il buco aperto nel frattempo (spec §2).
    const ramoCesta = senzaCommenti(registro).match(/if \('cesta' in body\)[\s\S]*?statoDopoCesta/)?.[0] ?? '';
    expect(ramoCesta).not.toBe('');
    expect(ramoCesta).not.toMatch(/admin_plus/);
  });

  it('lo stato ESPLICITO vince su quello implicito', () => {
    // Senza la guardia un corpo con stato e cesta insieme avrebbe due padroni, e a vincere
    // sarebbe stato l'ultimo ramo scritto, cioè il caso (spec §5).
    expect(senzaCommenti(registro)).toMatch(/if \(!\('stato' in patch\)\)/);
  });

  it('la regressione esplicita azzera la cesta, e solo su AcquaLatina', () => {
    // Il numero rimasto su una riga «da consegnare» è per definizione falso: si è appena
    // dichiarato che quel contatore NON è in deposito (spec §3).
    const src = senzaCommenti(registro);
    expect(src).toMatch(/patch\.stato === 'da_consegnare_deposito'/);
    expect(src).toMatch(/tabella === 'acqualatina_misuratori_rimossi'/);
  });

  it('la risposta porta i campi che il server ha deciso da sé', () => {
    // Il registro NON rifà la fetch sul successo: senza l'eco la colonna Stato resterebbe
    // quella vecchia a schermo.
    const src = senzaCommenti(registro);
    expect(src).toMatch(/risposta\.stato = patch\.stato/);
    expect(src).toMatch(/risposta\.cesta = patch\.cesta/);
  });

  it('il 400 sul registro ACEA resta: quella tabella non ha la colonna', () => {
    expect(registro).toMatch(/cesta non prevista su questo registro/);
  });
});

describe('il bacino della modale operatore resta filtrato per STATO', () => {
  it('misuratoriDaScaricare non filtra per cesta', () => {
    /*
      La decisione più facile da rovesciare per sbaglio leggendo solo il titolo della spec (§6).
      Un filtro `cesta IS NULL` seppellirebbe la riga incoerente esattamente come il buco che la
      spec chiude: se quella coppia si riformasse, la riga DEVE tornare nella modale.
    */
    const query = scarico.match(/export async function misuratoriDaScaricare[\s\S]*?\n\}/)?.[0] ?? '';
    expect(query).not.toBe('');
    expect(query).toMatch(/\.eq\('stato', DA_SCARICARE\)/);
    expect(senzaCommenti(query)).not.toMatch(/\.is\('cesta'/);
  });
});
```

- [ ] **Step 2: Lancia i test e verifica quali falliscono**

```bash
npx vitest run lib/misuratori/cestaInvarianteShape.test.ts
```

Atteso: FAIL sui primi cinque test del primo `describe`. Devono già passare: «il 400 sul registro ACEA resta» e tutto il secondo `describe` (sono guardie su codice che esiste già e non va toccato).

- [ ] **Step 3: Aggiungi l'import in testa a `lib/misuratori/registro.ts`**

Sostituisci la riga 4:

```ts
import { STATI_MISURATORE } from '@/types/misuratori';
```

con:

```ts
import { STATI_MISURATORE, type StatoMisuratore } from '@/types/misuratori';
import { statoDopoCesta } from './cestaStato';
```

- [ ] **Step 4: Applica l'invariante nel blocco della cesta**

In `lib/misuratori/registro.ts`, sostituisci il blocco `if ('cesta' in body) { ... }` (righe 129-134) con:

```ts
  // La CESTA la scrive l'operatore dal campo; qui si CORREGGE. Un numero sbagliato dichiarato
  // di sera è un contatore che l'ufficio cerca nella cesta sbagliata: doverlo far correggere
  // dall'operatore, col rapportino ormai chiuso, sarebbe una porta murata. Solo AcquaLatina:
  // la tabella ACEA non ha la colonna e la UPDATE fallirebbe.
  if ('cesta' in body) {
    if (tabella !== 'acqualatina_misuratori_rimossi') {
      return NextResponse.json({ error: 'cesta non prevista su questo registro' }, { status: 400 });
    }
    patch.cesta = typeof body.cesta === 'string' ? body.cesta.trim() || null : null;

    /*
      Scrivere la cesta È dichiarare lo scarico, anche quando a scriverla è l'ufficio: il numero
      e lo stato devono dire la stessa cosa. Senza questo blocco la riga corretta a mano restava
      nel bacino della modale dell'operatore — che ne sovrascriveva il numero in silenzio — e la
      cesta SVUOTATA lasciava lo stato avanti, cioè un contatore che nessuno avrebbe più chiesto
      a nessuno.

      Lo stato ESPLICITO vince: quello implicito si applica solo se il corpo non ne porta uno.
      E non passa dal gate admin_plus di sopra, di proposito — chi può scrivere la cesta può
      disfare la propria scrittura, e chiedere un admin lascerebbe il buco aperto nel frattempo.
    */
    if (!('stato' in patch)) {
      const { data: riga } = await supabaseAdmin
        .from(tabella)
        .select('stato')
        .eq('id', id)
        .maybeSingle();
      // Riga inesistente: niente stato implicito, e l'UPDATE più sotto non aggancerà niente.
      const implicito = riga
        ? statoDopoCesta((riga as { stato: StatoMisuratore }).stato, patch.cesta as string | null)
        : null;
      if (implicito) patch.stato = implicito;
    }
  }

  /*
    L'altra faccia dell'invariante: dichiarare che il misuratore NON è in deposito toglie il
    numero di cesta, che a quel punto è falso — e un riferimento falso in magazzino costa più di
    un riferimento assente. È anche la porta da cui l'incoerenza è probabilmente entrata in
    produzione: un admin_plus che riporta indietro lo stato dalla tendina, e la cesta che resta
    scritta. Sul ritorno IMPLICITO qui sopra è un no-op: la cesta era già `null`.
  */
  if (patch.stato === 'da_consegnare_deposito' && tabella === 'acqualatina_misuratori_rimossi') {
    patch.cesta = null;
  }
```

- [ ] **Step 5: Fai tornare al client quello che il server ha deciso**

Sempre in `lib/misuratori/registro.ts`, sostituisci le tre righe finali di `aggiornaRegistro` (righe 140-142):

```ts
  const { error } = await supabaseAdmin.from(tabella).update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
```

con:

```ts
  const { error } = await supabaseAdmin.from(tabella).update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  /*
    L'eco dei campi scritti. Il registro NON rifà la fetch quando il salvataggio riesce (scelta
    voluta: si aggiorna in ottimistica), quindi senza questa risposta lo stato mosso dalla cesta
    — e la cesta tolta dalla regressione — resterebbero invisibili fino al ricaricamento.
    Additiva: il registro ACEA passa dallo stesso handler e semplicemente non li riceve mai.
  */
  const risposta: Record<string, unknown> = { ok: true };
  if (patch.stato !== undefined) risposta.stato = patch.stato;
  if (patch.cesta !== undefined) risposta.cesta = patch.cesta;
  return NextResponse.json(risposta);
```

- [ ] **Step 6: Lancia i test e verifica che passino**

```bash
npx vitest run lib/misuratori/cestaInvarianteShape.test.ts lib/misuratori/cestaStato.test.ts
```

Atteso: PASS, 7 + 6 test.

- [ ] **Step 7: Verifica che la suite intera non sia peggiorata**

```bash
npx vitest run
```

Atteso: nessun test che passava prima ora fallisce. In particolare devono restare verdi `lib/misuratori/palletCellaShape.test.ts` e `lib/misuratori/registroAcqualatinaShape.test.ts`, che leggono lo stesso `registro.ts` che hai appena modificato.

- [ ] **Step 8: Commit**

```bash
git add lib/misuratori/registro.ts lib/misuratori/cestaInvarianteShape.test.ts
git commit -m "fix(misuratori): la cesta scritta dall'ufficio dichiara lo scarico

I due scrittori della colonna non si accordavano. Scrivere la cesta su una
riga «da consegnare» la lasciava nel bacino della modale, dove l'operatore
ne sovrascriveva il numero in silenzio; SVUOTARLA su una riga scaricata
lasciava lo stato avanti - un contatore fuori dal giro per sempre, e il
gesto era proprio quello pensato per dire «e' ancora in furgone».

Ora la cesta muove lo stato nei due sensi (solo fra i gradini adiacenti) e
la regressione esplicita a «da consegnare» azzera la cesta, che a quel
punto e' un riferimento falso. La risposta porta i campi decisi dal server:
il registro non rifa' la fetch sul successo."
```

---

### Task 3: Il registro mostra e dice quello che è successo

Senza questo task il server è coerente ma l'ufficio vede una colonna Stato vecchia. Spec §7: l'effetto non si conferma con un dialogo, **si vede e si legge**.

**Files:**
- Modify: `components/modules/misuratori/MisuratoriClient.tsx` (`handlePatch`, `:186-221`)
- Modify: `lib/misuratori/cestaInvarianteShape.test.ts` (aggiunge un terzo `describe`)

**Interfaces:**
- Consumes: la risposta `{ ok: true, stato?, cesta? }` di Task 2.
- Produces: niente per i task successivi (è l'ultimo).

- [ ] **Step 1: Aggiungi le guardie di forma del client, che falliscono**

In fondo a `lib/misuratori/cestaInvarianteShape.test.ts`, aggiungi:

```ts
describe("il registro d'ufficio mostra quello che il server ha deciso", () => {
  const client = readFileSync(
    resolve(__dirname, '../../components/modules/misuratori/MisuratoriClient.tsx'),
    'utf8',
  );

  it("l'eco della PATCH si fonde nella riga", () => {
    // Senza il merge la colonna Stato resterebbe quella vecchia: l'ottimistica applica solo
    // i campi che il CLIENT ha mandato, e lo stato implicito non è fra quelli.
    const src = senzaCommenti(client);
    expect(src).toMatch(/eco\.stato !== undefined/);
    expect(src).toMatch(/eco\.cesta !== undefined/);
  });

  it('il toast dell\'implicazione scatta solo su una PATCH che chiedeva la CESTA', () => {
    // Se l'ufficio ha mosso lo stato dalla tendina, annunciarglielo è rumore: l'ha appena
    // fatto di proposito.
    const src = senzaCommenti(client);
    expect(src).toMatch(/patch\.cesta !== undefined && eco\.stato === 'scaricato_deposito'/);
    expect(src).toMatch(/patch\.cesta !== undefined && eco\.stato === 'da_consegnare_deposito'/);
  });
});
```

- [ ] **Step 2: Lancia il test e verifica che fallisca**

```bash
npx vitest run lib/misuratori/cestaInvarianteShape.test.ts
```

Atteso: FAIL sui due test nuovi; gli altri sette restano verdi.

- [ ] **Step 3: Riscrivi `handlePatch`**

In `components/modules/misuratori/MisuratoriClient.tsx`, sostituisci l'intero `handlePatch` (righe 186-221) con:

```ts
  const handlePatch = useCallback(
    // `pallet` incluso: si scrive anche una cella alla volta, non solo in blocco dalla barra.
    // `cesta`: la scrive l'operatore allo scarico, qui la si CORREGGE (rapportino ormai chiuso).
    async (id: string, patch: { stato?: StatoMisuratore; note?: string; pallet?: string; cesta?: string }) => {
      setSalvando(prev => new Set(prev).add(id));
      // La cesta di PRIMA: serve a non annunciare una rimozione su una riga che non ne aveva
      // una. È il motivo per cui `rows` sta nelle dipendenze qui sotto.
      const cestaPrima = rows.find(r => r.id === id)?.cesta?.trim() || null;
      // Ottimistic update
      setRows(prev =>
        prev.map(r => r.id === id ? { ...r, ...patch } : r)
      );
      try {
        const res = await fetch(`${apiBase}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          /*
            Rollback PARLANTE, sempre: la riga che torna indietro da sola, senza una parola,
            insegna a non fidarsi del registro. `toast.error` e non `info` — un salvataggio
            rifiutato è un errore anche quando il motivo è legittimo (403 regressione vietata),
            e il fallback copre le risposte senza corpo JSON (proxy, 502).
          */
          const msg = (await res.json().catch(() => ({})) as { error?: string }).error;
          await fetchData(filters);
          toast.error(msg ?? 'Salvataggio rifiutato dal server: la riga è tornata com\'era.');
          return;
        }
        /*
          Il server può aver deciso PIÙ di quello che gli si è chiesto: scrivere la cesta
          dichiara lo scarico, svuotarla lo disfa, e riportare lo stato a «da consegnare» toglie
          la cesta, che a quel punto è un riferimento falso. Quei campi tornano nella risposta e
          si fondono nella riga — senza, la colonna resterebbe quella vecchia a schermo, perché
          il successo di proposito NON rifà la fetch.
        */
        const eco = await res.json().catch(() => ({})) as { stato?: StatoMisuratore; cesta?: string | null };
        const deciso: Partial<MisuratoreRimosso> = {};
        if (eco.stato !== undefined) deciso.stato = eco.stato;
        if (eco.cesta !== undefined) deciso.cesta = eco.cesta;
        if (Object.keys(deciso).length > 0) {
          setRows(prev => prev.map(r => r.id === id ? { ...r, ...deciso } : r));
        }
        /*
          E si dice a parole, che è l'altra metà di «l'effetto non resta nascosto». Niente
          dialogo di conferma: il gesto più frequente è correggere un refuso su una riga già
          scaricata, dove non cambia niente, e nei casi in cui lo stato si muove l'ufficio sta
          facendo proprio quello che intendeva. Il toast scatta SOLO quando il server ha deciso
          da sé: se lo stato l'ha mosso la tendina, annunciarlo sarebbe rumore.
        */
        if (patch.cesta !== undefined && eco.stato === 'scaricato_deposito') {
          toast.success(`Cesta ${patch.cesta.trim()} · il misuratore risulta scaricato a deposito.`);
        } else if (patch.cesta !== undefined && eco.stato === 'da_consegnare_deposito') {
          toast.success('Cesta tolta · il misuratore torna fra quelli da scaricare.');
        } else if (patch.stato !== undefined && eco.cesta === null && cestaPrima) {
          toast.success('Cesta tolta · il misuratore non risulta più in deposito.');
        }
      } catch {
        // Il caso peggiore era QUESTO: rete giù, rollback muto. La riga torna indietro e lo dice.
        await fetchData(filters);
        toast.error('Salvataggio non riuscito (rete): la riga è tornata com\'era.');
      } finally {
        setSalvando(prev => { const s = new Set(prev); s.delete(id); return s; });
      }
    },
    [apiBase, fetchData, filters, rows]
  );
```

Tre cose da NON perdere in questa sostituzione:
1. il `return` aggiunto dopo il `toast.error` del ramo `!res.ok` — senza, si proseguiva a leggere il corpo già consumato;
2. `rows` nelle dipendenze (serve per `cestaPrima`; il componente non è memoizzato, quindi non costa niente);
3. il terzo toast, che la spec non elencava fra i due messaggi ma che discende dallo stesso principio del §7: la regressione esplicita svuota la cesta, e una cella che si svuota da sé senza una parola è esattamente il tipo di effetto invisibile che la spec voleva evitare.

- [ ] **Step 4: Lancia i test e verifica che passino**

```bash
npx vitest run lib/misuratori/cestaInvarianteShape.test.ts
```

Atteso: PASS, 9 test.

- [ ] **Step 5: Verifica tipi e lint**

```bash
npx tsc --noEmit
```

Atteso: nessun errore in `MisuratoriClient.tsx`, `registro.ts`, `cestaStato.ts`.

```bash
npx eslint components/modules/misuratori/MisuratoriClient.tsx lib/misuratori/registro.ts lib/misuratori/cestaStato.ts
```

Atteso: nessun errore NUOVO. Se `react-hooks/exhaustive-deps` si lamenta, la dipendenza mancante va aggiunta, non silenziata.

- [ ] **Step 6: Suite intera**

```bash
npx vitest run
```

Atteso: nessuna regressione rispetto alla baseline.

- [ ] **Step 7: Commit**

```bash
git add components/modules/misuratori/MisuratoriClient.tsx lib/misuratori/cestaInvarianteShape.test.ts
git commit -m "feat(misuratori): il registro mostra e dice cosa ha deciso il server

Niente dialogo di conferma: il gesto piu' frequente e' correggere un refuso
su una riga gia' scaricata, dove non cambia niente. Ma l'effetto non resta
nascosto - la colonna Stato si aggiorna dall'eco della PATCH (il successo
non rifa' la fetch, di proposito) e un toast lo dice a parole.

Terzo messaggio oltre ai due della spec: la regressione esplicita svuota la
cesta, e una cella che si svuota da sola senza una parola e' proprio
l'effetto invisibile che il §7 voleva evitare."
```

---

## Verifica finale, a mano

Da fare dopo il merge e il deploy, sui dati veri — **senza riportare in chat, commit o PR matricole, ODL, indirizzi o nomi** (repo pubblico):

- [ ] Su `/hub/acqualatina/misuratori`, filtro Stato = «Da consegnare deposito», scrivi un numero di cesta in una cella → la colonna Stato passa a «Scaricato deposito» e compare il toast «Cesta N · il misuratore risulta scaricato a deposito.»
- [ ] Sulla stessa riga, svuota la cella della cesta → lo stato torna «Da consegnare deposito» e il toast dice «Cesta tolta · il misuratore torna fra quelli da scaricare.»
- [ ] Su una riga «Scaricato deposito» con cesta, riporta lo stato indietro dalla tendina (serve admin_plus) → la cella Cesta si svuota da sé e il toast lo dice.
- [ ] Su una riga «Verificato deposito», correggi la cifra della cesta → lo stato NON si muove e nessun toast compare.
- [ ] Sul registro **ACEA** (`/hub/misuratori/acea`), scrivi un pallet in cella → funziona come prima, nessun toast nuovo, nessun errore in console.
- [ ] Al primo rapportino AcquaLatina chiuso in positivo dopo il deploy, la modale di scarico elenca i contatori come sempre.

## Fuori piano, da decidere con l'utente

- [ ] **La riga incoerente in produzione** (cesta valorizzata + `da_consegnare_deposito`). Il codice nuovo non ripara lo storico. Proposta della spec: portarla a `scaricato_deposito`. Si guarda la riga insieme all'utente e **non si scrive niente senza un ok esplicito**.
