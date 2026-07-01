import { describe, it, expect } from 'vitest';
import { mappaMasterSnapshot } from './masterSnapshot.mjs';

describe('mappaMasterSnapshot', () => {
  it('mappa le righe grezze del master a snapshot {odl, attivita, ...} scartando gli ODL vuoti', () => {
    const grezze = [
      { odl: ' 912212680 ', attivita: '', esecutore: 'PASTORELLI', dataRaw: '2026-06-03 00:00:00', statoRaw: 'completato', matricola: 'M1', comune: 'ZAGAROLO', esito: 'eseguito', saracinesca: 'SI', odlSaracinesca: '999' },
      { odl: '', attivita: 'X' }, // scartata
      { odl: 'A2' }, // campi mancanti → stringhe vuote
    ];
    const out = mappaMasterSnapshot(grezze);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      odl: '912212680',
      attivita: '',
      esecutore: 'PASTORELLI',
      dataRaw: '2026-06-03 00:00:00',
      statoRaw: 'completato',
      matricola: 'M1',
      comune: 'ZAGAROLO',
      esito: 'eseguito',
      saracinesca: 'SI',
      odlSaracinesca: '999',
    });
    expect(out[1]).toEqual({ odl: 'A2', attivita: '', esecutore: '', dataRaw: '', statoRaw: '', matricola: '', comune: '', esito: '', saracinesca: '', odlSaracinesca: '' });
  });

  it('input vuoto → array vuoto', () => {
    expect(mappaMasterSnapshot([])).toEqual([]);
  });

  it('mantiene le righe senza ODL ma con matricola (manuali dal campo / non ordinate)', () => {
    const out = mappaMasterSnapshot([
      { odl: '', matricola: '202015', saracinesca: 'SI', esito: 'eseguito' },
      { odl: 'DA CHIEDERE', matricola: '202016', saracinesca: 'SI', esito: 'eseguito' },
      { odl: '', attivita: 'X' }, // senza matricola → ancora scartata
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ odl: '', matricola: '202015', saracinesca: 'SI' });
    expect(out[1]).toMatchObject({ odl: 'DA CHIEDERE', matricola: '202016' });
  });
});
