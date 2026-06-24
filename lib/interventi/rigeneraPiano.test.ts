// lib/interventi/rigeneraPiano.test.ts
// Orchestrazione del salvataggio piano: rigenera gli interventi E risincronizza le voci dei
// rapportini esistenti (badge "nuovo" sui nuovi ODL), in modo robusto e non-bloccante.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/interventi/ensureInterventiForPiano', () => ({
  ensureInterventiForPiano: vi.fn(async () => ({ creati: 2, preservati: 1, scartati: 0 })),
}));

import { ensureInterventiForPiano } from '@/lib/interventi/ensureInterventiForPiano';
import { rigeneraPiano } from './rigeneraPiano';
import { makeFakeDb, seedBase } from './testUtils/fakeSupabase';

describe('rigeneraPiano', () => {
  it('senza rapportini esistenti: rigenera solo gli interventi, niente sync voci', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
    }));
    const res = await rigeneraPiano(db, 'p1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.creati).toBe(2);
      expect(res.rapportiniSync).toBeUndefined();   // nessun template stabilito → niente sync
    }
    expect(tables.rapportino_voci.length).toBe(0);
  });

  it('con un rapportino in_corso: risincronizza e aggiunge la voce del nuovo ODL col badge', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }, { id: 't2', odl: 'ODL2' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso', template_id: 'tpl1' }],
      rapportino_voci: [{ id: 'v1', rapportino_id: 'rap1', task_id: 't1', manuale: false, risposte: {}, raw_json: {} }],
    }));
    const res = await rigeneraPiano(db, 'p1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.rapportiniSync).toBe(1);
    const voci = tables.rapportino_voci.filter((v) => v.rapportino_id === 'rap1');
    expect(voci.map((v) => v.task_id).sort()).toEqual(['t1', 't2']);
    const nuova = voci.find((v) => v.task_id === 't2') as { raw_json?: { _nuovo?: boolean } } | undefined;
    expect(nuova?.raw_json?._nuovo).toBe(true);
  });

  it('non tocca un rapportino INVIATO (skipInviati): il nuovo ODL non vi compare', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }, { id: 't2', odl: 'ODL2' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'inviato', template_id: 'tpl1' }],
      rapportino_voci: [{ id: 'v1', rapportino_id: 'rap1', task_id: 't1', manuale: false, risposte: {}, raw_json: {} }],
    }));
    const res = await rigeneraPiano(db, 'p1');
    expect(res.ok).toBe(true);
    const voci = tables.rapportino_voci.filter((v) => v.rapportino_id === 'rap1');
    expect(voci.map((v) => v.task_id).sort()).toEqual(['t1']); // inviato intatto
  });

  it('se ensureInterventiForPiano fallisce, ritorna ok:false con lo status', async () => {
    vi.mocked(ensureInterventiForPiano).mockResolvedValueOnce({ error: 'Piano non trovato.' } as never);
    const { db } = makeFakeDb(seedBase());
    const res = await rigeneraPiano(db, 'pX');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it('se il sync voci ritorna conflitto, NON fallisce: interventi salvati + warning', async () => {
    // intervento ODL1 completato sotto s1 ma task proposto sotto s2 → 409 spostamento_completato
    const { db } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's2', staff_name: 'Luigi', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's2', token: 'TOK1', stato: 'in_corso', template_id: 'tpl1' }],
      interventi: [{ id: 'i1', piano_id: 'p1', staff_id: 's1', odl: 'ODL1', stato: 'completato' }],
    }));
    const res = await rigeneraPiano(db, 'p1');
    expect(res.ok).toBe(true);                 // gli interventi sono comunque stati rigenerati
    if (res.ok) expect(res.rapportiniWarning).toMatch(/spostamento_completato/);
  });
});
