import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Test di COMPORTAMENTO su aggiornaRegistro, non di forma: le guardie in
  cestaInvarianteShape.test.ts sono regex sul sorgente e non vedono la COLLOCAZIONE dei rami —
  se il blocco della regressione (§3, azzera la cesta) finisse sopra il blocco `if ('cesta' in
  body)`, quelle regex continuerebbero a passare mentre un corpo
  `{ stato: 'da_consegnare_deposito', cesta: 'X' }` scriverebbe la cesta SOPRA l'azzeramento.
  Qui si guarda il risultato vero: il corpo di `res.json()` e il `patch` passato alla UPDATE.

  Fake minimo di Supabase, stesso mestiere di lib/acea/operatoriGiorno.test.ts: regge solo le
  due catene che `aggiornaRegistro` usa — `.select('stato').eq(...).maybeSingle()` per leggere
  lo stato corrente, `.update(patch).eq(...)` per scrivere. `vitest.config.ts` aliasa già
  `server-only`, quindi l'import diretto del modulo non ha bisogno di altro setup.
*/

let rigaCorrente: { stato: string } | null = null;
let erroreLettura: { message: string } | null = null;
let ultimoPatch: Record<string, unknown> | null = null;
let ultimaTabella: string | null = null;
let updateChiamato = false;

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (tabella: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve(
              erroreLettura ? { data: null, error: erroreLettura } : { data: rigaCorrente, error: null },
            ),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        updateChiamato = true;
        ultimoPatch = patch;
        ultimaTabella = tabella;
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
    }),
  },
}));

const { aggiornaRegistro } = await import('./registro');

beforeEach(() => {
  rigaCorrente = null;
  erroreLettura = null;
  ultimoPatch = null;
  ultimaTabella = null;
  updateChiamato = false;
});

describe('aggiornaRegistro — invariante cesta↔stato (comportamento, non forma)', () => {
  it('1. cesta scritta su riga da_consegnare_deposito: la UPDATE porta anche lo stato, e la risposta lo eco', async () => {
    rigaCorrente = { stato: 'da_consegnare_deposito' };
    const res = await aggiornaRegistro('acqualatina_misuratori_rimossi', 'm1', { cesta: '5' }, null);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, stato: 'scaricato_deposito', cesta: '5' });
    expect(updateChiamato).toBe(true);
    expect(ultimaTabella).toBe('acqualatina_misuratori_rimossi');
    expect(ultimoPatch).toMatchObject({ cesta: '5', stato: 'scaricato_deposito' });
  });

  it('2. cesta svuotata su riga scaricato_deposito: la UPDATE porta cesta null e lo stato torna indietro', async () => {
    rigaCorrente = { stato: 'scaricato_deposito' };
    const res = await aggiornaRegistro('acqualatina_misuratori_rimossi', 'm1', { cesta: '' }, null);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, stato: 'da_consegnare_deposito', cesta: null });
    expect(ultimoPatch).toMatchObject({ cesta: null, stato: 'da_consegnare_deposito' });
  });

  it('3. cesta corretta oltre lo scarico (verificato_deposito): la UPDATE NON tocca lo stato', async () => {
    rigaCorrente = { stato: 'verificato_deposito' };
    const res = await aggiornaRegistro('acqualatina_misuratori_rimossi', 'm1', { cesta: '7' }, null);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.stato).toBeUndefined();
    expect('stato' in body).toBe(false);
    expect(body).toMatchObject({ ok: true, cesta: '7' });
    expect(ultimoPatch).not.toHaveProperty('stato');
    expect(ultimoPatch).toMatchObject({ cesta: '7' });
  });

  it('4. stato esplicito nel corpo vince su quello implicito', async () => {
    // rigaCorrente a 'da_consegnare_deposito', non 'scaricato_deposito': con quest'ultimo
    // statoDopoCesta('scaricato_deposito', '9') torna già null, quindi l'esplicito e l'implicito
    // avrebbero coinciso e il test non avrebbe provato niente. Da 'da_consegnare_deposito' invece
    // l'implicito calcolerebbe 'scaricato_deposito' — DIVERSO dall'esplicito 'verificato_deposito'
    // sotto — ed è lo scarto fra i due a rendere l'asserzione non vacua.
    // Avanza (da consegnare → verificato, salta un gradino): non è una regressione, passa a
    // qualunque ruolo.
    rigaCorrente = { stato: 'da_consegnare_deposito' };
    const res = await aggiornaRegistro(
      'acqualatina_misuratori_rimossi',
      'm1',
      { stato: 'verificato_deposito', cesta: '9' },
      null,
    );
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    // Lo stato è quello ESPLICITO, non quello che statoDopoCesta avrebbe calcolato dal cesta
    // ('scaricato_deposito', il gradino subito dopo 'da_consegnare_deposito').
    expect(body).toMatchObject({ ok: true, stato: 'verificato_deposito', cesta: '9' });
    expect(ultimoPatch).toMatchObject({ stato: 'verificato_deposito', cesta: '9' });
  });

  it('5. regressione esplicita a da_consegnare_deposito: la UPDATE azzera la cesta', async () => {
    // La regressione passa dal gate admin_plus: qui si prova l'EFFETTO (§3), non il gate.
    const res = await aggiornaRegistro(
      'acqualatina_misuratori_rimossi',
      'm1',
      { stato: 'da_consegnare_deposito' },
      { role: 'admin_plus' },
    );
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, stato: 'da_consegnare_deposito', cesta: null });
    expect(ultimoPatch).toMatchObject({ stato: 'da_consegnare_deposito', cesta: null });
  });

  it('6. regressione esplicita CON cesta nello STESSO corpo: vince lo stato, la cesta si azzera comunque', async () => {
    // Il caso che il test 5 non prova: lì il corpo manda solo `stato`, quindi non c'è una cesta
    // in arrivo che un blocco spostato possa riscrivere SOPRA l'azzeramento. Qui il corpo porta
    // `{ stato: 'da_consegnare_deposito', cesta: '7' }` insieme (spec §5: «vince lo stato, e la
    // cesta si azzera per la regola 3») — è la mutazione che le guardie di forma in
    // cestaInvarianteShape.test.ts non vedono: se il blocco della regressione finisse sopra
    // `if ('cesta' in body)`, quelle regex continuerebbero a passare mentre la UPDATE scriverebbe
    // '7', non null. Ruolo admin_plus: serve per superare il gate di regressione sullo stato.
    const res = await aggiornaRegistro(
      'acqualatina_misuratori_rimossi',
      'm1',
      { stato: 'da_consegnare_deposito', cesta: '7' },
      { role: 'admin_plus' },
    );
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, stato: 'da_consegnare_deposito', cesta: null });
    expect(ultimoPatch).toMatchObject({ stato: 'da_consegnare_deposito', cesta: null });
  });

  it('7. registro ACEA con cesta nel corpo: 400, nessuna scrittura', async () => {
    const res = await aggiornaRegistro('misuratori_rimossi', 'm1', { cesta: '3' }, null);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/cesta non prevista su questo registro/);
    expect(updateChiamato).toBe(false);
  });

  it('8. lettura dello stato fallita (ramo cesta): 500, nessuna scrittura', async () => {
    // Copre l'intervento 1: ingoiare l'errore qui scriverebbe la sola cesta senza stato, la
    // stessa incoerenza che questo ramo esiste per chiudere — e in silenzio.
    erroreLettura = { message: 'connessione al DB persa' };
    const res = await aggiornaRegistro('acqualatina_misuratori_rimossi', 'm1', { cesta: '5' }, null);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.error).toBe('connessione al DB persa');
    expect(updateChiamato).toBe(false);
  });

  it('9. lettura dello stato fallita (gate admin_plus): 500, fail-closed e non fail-open', async () => {
    // Il secondo chiamante di statoAttuale (intervento 1): prima dell'intervento un errore di
    // lettura tornava `null`, il gate lo leggeva come "riga assente" e lasciava passare la
    // regressione. Qui il ruolo NON è admin_plus: senza il fix, la scrittura proseguirebbe.
    erroreLettura = { message: 'connessione al DB persa' };
    const res = await aggiornaRegistro(
      'acqualatina_misuratori_rimossi',
      'm1',
      { stato: 'da_consegnare_deposito' },
      null,
    );
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.error).toBe('connessione al DB persa');
    expect(updateChiamato).toBe(false);
  });
});
