// lib/interventi/sincronizzaRapportini.test.ts
// Test del motore di (ri)generazione rapportini. Usa un fake Supabase client in-memory
// (chainable) e mocka ensureInterventiForPiano per isolare l'orchestrazione del motore.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/interventi/ensureInterventiForPiano', () => ({
  ensureInterventiForPiano: vi.fn(async () => ({ creati: 0, preservati: 0, scartati: 0 })),
}));

import { sincronizzaRapportini, isInterventoFkError } from './sincronizzaRapportini';
import { makeFakeDb, seedBase } from './testUtils/fakeSupabase';

const OPTS = { templateId: 'tpl1' };

describe('sincronizzaRapportini', () => {
  it('riusa lo stesso token per un operatore con rapportino esistente', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.rapportini[0].token).toBe('TOK1');
    expect(tables.rapportini.find((r) => r.staff_id === 's1')?.token).toBe('TOK1');
  });

  it('preserva le risposte già compilate per i task che restano', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
      rapportino_voci: [{ id: 'v1', rapportino_id: 'rap1', task_id: 't1', risposte: { q: 'A' }, raw_json: {} }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const voce = tables.rapportino_voci.find((v) => v.task_id === 't1');
    expect(voce?.risposte).toEqual({ q: 'A' });
  });

  it('crea un nuovo token per un operatore senza rapportino', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's3', staff_name: 'Giovanni', tasks: [{ id: 't9', odl: 'ODL9' }] }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    if (res.ok) expect(typeof res.rapportini[0].token).toBe('string');
    if (res.ok) expect(res.rapportini[0].token.length).toBeGreaterThan(0);
    expect(tables.rapportini.find((r) => r.staff_id === 's3')).toBeTruthy();
  });

  it('riapre un rapportino inviato SOLO con confermaInviati', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'inviato' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1', confermaInviati: true });
    expect(res.ok).toBe(true);
    const rap = tables.rapportini.find((r) => r.id === 'rap1');
    expect(rap?.stato).toBe('in_corso');
    expect(rap?.riaperto_at).toBeTruthy();
  });

  it('NON riapre un rapportino inviato senza conferma', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'inviato' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    const rap = tables.rapportini.find((r) => r.id === 'rap1');
    expect(rap?.stato).toBe('inviato');
    expect(rap?.riaperto_at).toBeFalsy();
  });

  it('rifiuta lo spostamento di un intervento completato (409)', async () => {
    // intervento ODL1 completato sotto s1, ma proposto sotto s2 → spostamento illecito
    const { db } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's2', staff_name: 'Luigi', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      interventi: [{ id: 'i1', piano_id: 'p1', staff_id: 's1', odl: 'ODL1', stato: 'completato' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.error).toMatch(/^spostamento_completato:/);
    }
  });
});

describe('isInterventoFkError', () => {
  it('riconosce la FK su rapportino_voci.intervento_id', () => {
    expect(isInterventoFkError('insert or update on table "rapportino_voci" violates foreign key constraint "rapportino_voci_intervento_id_fkey"')).toBe(true);
  });
  it('ignora altri errori e valori vuoti', () => {
    expect(isInterventoFkError('altro errore qualsiasi')).toBe(false);
    expect(isInterventoFkError(null)).toBe(false);
    expect(isInterventoFkError(undefined)).toBe(false);
  });
});

describe('sincronizzaRapportini — voce annullata', () => {
  it('un task annullato produce una voce con raw_json._annullato = true', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1', annullato: true }] }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    const voce = tables.rapportino_voci.find((v) => v.task_id === 't1') as { annullato?: unknown; raw_json?: { _annullato?: boolean } } | undefined;
    expect(voce?.raw_json?._annullato).toBe(true);
    // Il flag vive SOLO in raw_json: 'annullato' non è una colonna di rapportino_voci (il DB reale la rifiuta).
    expect(voce?.annullato).toBeUndefined();
  });
});

describe('sincronizzaRapportini — preserva le voci manuali (dal +)', () => {
  it('una rigenerazione/salvataggio del piano NON cancella le voci manuali', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
      rapportino_voci: [
        { id: 'v1', rapportino_id: 'rap1', task_id: 't1', manuale: false, risposte: {}, raw_json: {} },
        { id: 'vman', rapportino_id: 'rap1', task_id: null, manuale: true, approvazione_stato: 'in_attesa', richiesta_id: 'req1', risposte: { esito: 'OK' }, raw_json: { _nuovo: true } },
      ],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const manuale = tables.rapportino_voci.find((v) => v.id === 'vman');
    expect(manuale).toBeTruthy();                        // non cancellata
    expect(manuale?.risposte).toEqual({ esito: 'OK' });  // dati intatti
    expect(tables.rapportino_voci.filter((v) => v.task_id === 't1').length).toBe(1); // task ricostruito
  });
});

describe('sincronizzaRapportini — fallback FK su race', () => {
  it("se l'insert voci va in FK violation, salva le voci SENZA collegamento e non fallisce", async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      interventi: [{ id: 'i1', piano_id: 'p1', staff_id: 's1', odl: 'ODL1', stato: 'assegnato' }],
    }), { failVociInsertOnce: 'violates foreign key constraint "rapportino_voci_intervento_id_fkey"' });
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    const voce = tables.rapportino_voci.find((v) => v.task_id === 't1');
    expect(voce).toBeTruthy();
    expect(voce?.intervento_id ?? null).toBeNull();
  });
});

describe('sincronizzaRapportini — skipInviati (sync automatico dal salvataggio del piano)', () => {
  const seedConRapportino = (stato: string) => seedBase({
    mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }, { id: 't2', odl: 'ODL2' }] }],
    rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato }],
    rapportino_voci: [{ id: 'v1', rapportino_id: 'rap1', task_id: 't1', manuale: false, risposte: {}, raw_json: {} }],
  });

  it('con skipInviati NON tocca le voci di un rapportino inviato (il nuovo ODL non viene aggiunto)', async () => {
    const { db, tables } = makeFakeDb(seedConRapportino('inviato'));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1', skipInviati: true });
    expect(res.ok).toBe(true);
    const voci = tables.rapportino_voci.filter((v) => v.rapportino_id === 'rap1');
    expect(voci.map((v) => v.task_id).sort()).toEqual(['t1']); // t2 NON aggiunto all'inviato
  });

  it('senza skipInviati ricostruisce le voci anche di un inviato (comportamento esistente, opt-in)', async () => {
    const { db, tables } = makeFakeDb(seedConRapportino('inviato'));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    const voci = tables.rapportino_voci.filter((v) => v.rapportino_id === 'rap1');
    expect(voci.map((v) => v.task_id).sort()).toEqual(['t1', 't2']);
  });

  it('skipInviati NON salta i rapportini in_corso: il nuovo ODL viene aggiunto con badge _nuovo', async () => {
    const { db, tables } = makeFakeDb(seedConRapportino('in_corso'));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1', skipInviati: true });
    expect(res.ok).toBe(true);
    const voci = tables.rapportino_voci.filter((v) => v.rapportino_id === 'rap1');
    expect(voci.map((v) => v.task_id).sort()).toEqual(['t1', 't2']);
    const nuova = voci.find((v) => v.task_id === 't2') as { raw_json?: { _nuovo?: boolean } } | undefined;
    expect(nuova?.raw_json?._nuovo).toBe(true); // rapportino preesistente + task nuovo → badge
  });
});
