import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Test di COMPORTAMENTO su assegnaCesta: l'assegnazione IN BLOCCO applica la stessa invariante
  cesta↔stato della cella (aggiornaRegistro), ma la selezione può mescolare righe a stati
  diversi — una UPDATE sola non basta. Vedi il commento in testa alla funzione (registro.ts)
  e docs/superpowers/specs/2026-08-04-acqualatina-cesta-stato-coerenza-design.md.

  Fake di Supabase su misura per QUESTA forma di chiamata, diversa da quella di
  registroCesta.test.ts: lì aggiornaRegistro legge con `.select('stato').eq(id).maybeSingle()`,
  qui assegnaCesta legge con `.select('id, stato').in('id', ids)` (un blocco di righe, non una)
  e scrive con `.update(patch).in('id', ids).select('id')` (non `.eq(id)`). Da qui il mock
  separato invece di riusare quello di registroCesta.test.ts. `vitest.config.ts` aliasa già
  `server-only`.
*/

/** Stato attuale di ogni riga esistente, indicizzato per id: il fixture di ogni test. */
let statoRighe: Record<string, string> = {};
let erroreLettura: { message: string } | null = null;
let erroreScrittura: { message: string } | null = null;
/** Ogni UPDATE eseguita — patch e id a cui è stata applicata — nell'ordine di chiamata. */
let updates: { patch: Record<string, unknown>; ids: string[]; tabella: string }[] = [];
/** Ogni lettura di stato eseguita, per verificare il chunking a blocchi di 200. */
let letture: { tabella: string; ids: string[] }[] = [];

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (tabella: string) => ({
      select: () => ({
        in: (_col: string, ids: string[]) => {
          letture.push({ tabella, ids });
          if (erroreLettura) return Promise.resolve({ data: null, error: erroreLettura });
          const data = ids.filter((id) => id in statoRighe).map((id) => ({ id, stato: statoRighe[id] }));
          return Promise.resolve({ data, error: null });
        },
      }),
      update: (patch: Record<string, unknown>) => ({
        in: (_col: string, ids: string[]) => ({
          select: () => {
            if (erroreScrittura) return Promise.resolve({ data: null, error: erroreScrittura });
            updates.push({ patch, ids, tabella });
            return Promise.resolve({ data: ids.map((id) => ({ id })), error: null });
          },
        }),
      }),
    }),
  },
}));

const { assegnaCesta } = await import('./registro');

beforeEach(() => {
  statoRighe = {};
  erroreLettura = null;
  erroreScrittura = null;
  updates = [];
  letture = [];
});

describe('assegnaCesta — invariante cesta↔stato applicata IN BLOCCO (solo AcquaLatina)', () => {
  it('blocco su righe da_consegnare_deposito con cesta valorizzata: la UPDATE porta anche scaricato_deposito', async () => {
    statoRighe = { m1: 'da_consegnare_deposito', m2: 'da_consegnare_deposito' };
    const res = await assegnaCesta('acqualatina_misuratori_rimossi', ['m1', 'm2'], '5');
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, aggiornati: 2, cesta: '5', cambiStato: 2 });
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ cesta: '5', stato: 'scaricato_deposito' });
    expect([...updates[0].ids].sort()).toEqual(['m1', 'm2']);
  });

  it('blocco con cesta svuotata su righe scaricato_deposito: la UPDATE riporta a da_consegnare_deposito', async () => {
    statoRighe = { m1: 'scaricato_deposito', m2: 'scaricato_deposito' };
    const res = await assegnaCesta('acqualatina_misuratori_rimossi', ['m1', 'm2'], null);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, aggiornati: 2, cesta: null, cambiStato: 2 });
    expect(updates[0].patch).toMatchObject({ cesta: null, stato: 'da_consegnare_deposito' });
  });

  it('selezione MISTA: ogni gruppo di stato riceve la sua UPDATE, oltre lo scarico non si muove nulla', async () => {
    // Il caso che una singola UPDATE non può servire: tre righe, tre situazioni diverse nella
    // STESSA chiamata. m1 sul gradino di partenza (si muove), m2 già scaricata (sola
    // correzione della cifra), m3 oltre lo scarico (la logistica è andata avanti, non torna
    // indietro per una cesta riscritta).
    statoRighe = {
      m1: 'da_consegnare_deposito',
      m2: 'scaricato_deposito',
      m3: 'verificato_deposito',
    };
    const res = await assegnaCesta('acqualatina_misuratori_rimossi', ['m1', 'm2', 'm3'], '9');
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, aggiornati: 3, cesta: '9', cambiStato: 1 });
    // Due gruppi distinti: chi cambia stato (m1 solo) e chi no (m2, m3 insieme).
    expect(updates).toHaveLength(2);
    const conStato = updates.find((u) => 'stato' in u.patch);
    const senzaStato = updates.find((u) => !('stato' in u.patch));
    expect(conStato?.ids).toEqual(['m1']);
    expect(conStato?.patch).toMatchObject({ cesta: '9', stato: 'scaricato_deposito' });
    expect([...(senzaStato?.ids ?? [])].sort()).toEqual(['m2', 'm3']);
    expect(senzaStato?.patch).toMatchObject({ cesta: '9' });
    expect(senzaStato?.patch).not.toHaveProperty('stato');
  });

  it('su ACEA: la cesta si scrive in blocco, nessuno stato si tocca e nessuno stato si legge', async () => {
    // Fino al 2026-08-04 la stessa colonna era `pallet` e non c'era invariante da rispettare;
    // dopo la fusione l'invariante esiste ma resta gated su AcquaLatina — su ACEA la cesta è
    // un riferimento e basta, esattamente come prima.
    const res = await assegnaCesta('misuratori_rimossi', ['m1', 'm2'], '3');
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, aggiornati: 2, cesta: '3', cambiStato: 0 });
    // Nessuna lettura di stato: il ramo dell'invariante non si attiva nemmeno.
    expect(letture).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ cesta: '3' });
    expect(updates[0].patch).not.toHaveProperty('stato');
  });

  it('lettura degli stati fallita: 500 col messaggio dell\'errore, nessuna scrittura', async () => {
    // Ingoiare l'errore qui scriverebbe la sola cesta senza stato su TUTTA la selezione — la
    // stessa incoerenza che l'invariante esiste per chiudere, moltiplicata per il blocco.
    erroreLettura = { message: 'connessione al DB persa' };
    const res = await assegnaCesta('acqualatina_misuratori_rimossi', ['m1', 'm2'], '5');
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.error).toBe('connessione al DB persa');
    expect(updates).toHaveLength(0);
  });

  it('gruppo che supera 200 id: lettura E scrittura restano a blocchi di 200, non un round-trip gigante', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `m${i}`);
    statoRighe = Object.fromEntries(ids.map((id) => [id, 'da_consegnare_deposito']));
    const res = await assegnaCesta('acqualatina_misuratori_rimossi', ids, '1');
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, aggiornati: 250, cambiStato: 250 });
    // Lettura a blocchi di 200, come le UPDATE di sempre: due chiamate, 200 + 50.
    expect(letture.map((l) => l.ids.length)).toEqual([200, 50]);
    // Il gruppo risultante è UNO solo (tutte → scaricato_deposito) ma la scrittura si spacca
    // comunque in blocchi di 200: non una sola UPDATE con 250 id dentro un `.in(...)`.
    expect(updates.map((u) => u.ids.length)).toEqual([200, 50]);
    for (const u of updates) expect(u.patch).toMatchObject({ stato: 'scaricato_deposito' });
  });
});
