import { describe, it, expect } from 'vitest';
import { makeFakeDb } from '@/lib/interventi/testUtils/fakeSupabase';
import { caricaTemplateManuali, escludiRiservati } from './caricaTemplateManuali';

const SEED = {
  rapportino_template: [
    { id: 'mobili', committente: 'italgas', active: true, solo_manuale: true, campi: [], riservato_pi: false },
    { id: 'pi', committente: 'italgas', active: true, solo_manuale: true, campi: [], riservato_pi: true },
    { id: 'lim', committente: 'lim_massive', active: false, solo_manuale: true, campi: [], riservato_pi: false },
    { id: 'classico', committente: null, active: true, solo_manuale: false, campi: [] },
  ],
};

describe('caricaTemplateManuali', () => {
  it('esclude i riservati (P.I.) dal pool del "+"', async () => {
    const { db } = makeFakeDb(SEED);
    const rows = await caricaTemplateManuali(db);
    expect(rows.map((r) => r.id).sort()).toEqual(['lim', 'mobili']);
  });
  it('soloAttivi filtra anche gli archiviati', async () => {
    const { db } = makeFakeDb(SEED);
    const rows = await caricaTemplateManuali(db, { soloAttivi: true });
    expect(rows.map((r) => r.id)).toEqual(['mobili']);
  });
});

describe('escludiRiservati (pura)', () => {
  it('tollera righe senza flag (pre-migration): nessuna esclusa', () => {
    const rows = [{ id: 'a' }, { id: 'b', riservato_pi: null }];
    expect(escludiRiservati(rows)).toHaveLength(2);
  });
});
