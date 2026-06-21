import { describe, it, expect } from 'vitest';
import { raggruppaCommessaAttivita } from './raggruppaCommessaAttivita';

const cfg = [
  { file: 'ZAGAROLO.xlsx', committente: 'acea', attivita: 'LIMITAZIONI MASSIVE' },
  { file: 'LIMITAZIONI CON ORDINE.xlsx', committente: 'acea', attivita: 'DUNNING' },
  { file: 'ITALGAS.xlsx', committente: 'italgas', attivita: 'MOBILI' },
];

describe('raggruppaCommessaAttivita', () => {
  it('raggruppa per committente e attività', () => {
    const righe = [
      { id: '1', file: 'ZAGAROLO.xlsx' }, { id: '2', file: 'LIMITAZIONI CON ORDINE.xlsx' },
      { id: '3', file: 'ZAGAROLO.xlsx' }, { id: '4', file: 'ITALGAS.xlsx' },
    ];
    const r = raggruppaCommessaAttivita(righe, cfg);
    expect(r.map((c) => c.committente)).toEqual(['acea', 'italgas']);
    const acea = r.find((c) => c.committente === 'acea')!;
    expect(acea.attivita.map((a) => a.attivita)).toEqual(['DUNNING', 'LIMITAZIONI MASSIVE']);
    expect(acea.ids.sort()).toEqual(['1', '2', '3']);
    expect(acea.attivita.find((a) => a.attivita === 'LIMITAZIONI MASSIVE')!.ids.sort()).toEqual(['1', '3']);
  });

  it('file non configurato → committente "altro"', () => {
    const r = raggruppaCommessaAttivita([{ id: '9', file: 'X.xlsx' }], cfg);
    expect(r).toEqual([{ committente: 'altro', ids: ['9'], attivita: [{ attivita: '(non configurato)', ids: ['9'] }] }]);
  });

  it('nessuna riga → nessun nodo', () => {
    expect(raggruppaCommessaAttivita([], cfg)).toEqual([]);
  });
});
