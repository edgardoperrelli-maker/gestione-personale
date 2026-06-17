import { describe, it, expect } from 'vitest';
import { righeModificate, conflittiRighe, nonCollocate } from './storicoExport';

const dettaglio = {
  generatoIl: '20260617-1000',
  dryRun: false,
  file: [
    {
      file: 'ZAGAROLO.xlsx',
      master: true,
      aggiornate: 1,
      extraAggiunte: 1,
      conflitti: [{ riga: 5, campo: 'data', esistente: '2026-06-01', nuovo: '2026-06-03' }],
      colonneAssenti: [],
      righe: [
        { riga: 2, tipo: 'aggiornata', comune: 'ZAGAROLO', odl: '912231020', matricola: '20000020750', via: 'VIA X', esecutore: 'CIARALLO', esito: 'eseguito', sigillo: 'AA728566', data: '2026-06-03', saracinesca: '', note: '' },
        { riga: 4, tipo: 'extra', comune: 'ZAGAROLO', odl: '', matricola: '202315612361', via: 'VIA Y', esecutore: 'PASTORELLI', esito: 'No', sigillo: '', data: '2026-06-04', saracinesca: '', note: 'Cane in giardino' },
      ],
    },
    { file: 'ALTRO.xlsx', master: false, righe: [], conflitti: [] },
  ],
  extraNonCollocate: [{ id: 'z', comune: 'ROMA', matricola: '999', esecutore: 'NERI' }],
  comuniNonAgganciati: ['TIVOLI'],
};

describe('storicoExport', () => {
  it('righeModificate appiattisce le righe coi nomi file', () => {
    const r = righeModificate(dettaglio);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ file: 'ZAGAROLO.xlsx', riga: 2, tipo: 'aggiornata', matricola: '20000020750' });
    expect(r[1]).toMatchObject({ file: 'ZAGAROLO.xlsx', tipo: 'extra', note: 'Cane in giardino' });
  });

  it('conflittiRighe estrae i conflitti per file', () => {
    const c = conflittiRighe(dettaglio);
    expect(c).toHaveLength(1);
    expect(c[0]).toEqual({ file: 'ZAGAROLO.xlsx', riga: 5, campo: 'data', esistente: '2026-06-01', nuovo: '2026-06-03' });
  });

  it('nonCollocate unisce extra senza file + comuni non agganciati', () => {
    const n = nonCollocate(dettaglio);
    expect(n).toHaveLength(2);
    expect(n[0]).toMatchObject({ comune: 'ROMA', matricola: '999', motivo: 'comune senza file' });
    expect(n[1]).toMatchObject({ comune: 'TIVOLI', motivo: 'comune non agganciato' });
  });

  it('input malformati → array vuoti, niente eccezioni', () => {
    expect(righeModificate(null)).toEqual([]);
    expect(righeModificate(undefined)).toEqual([]);
    expect(righeModificate({})).toEqual([]);
    expect(righeModificate({ file: 'non-array' })).toEqual([]);
    expect(conflittiRighe(42)).toEqual([]);
    expect(nonCollocate('x')).toEqual([]);
  });
});
