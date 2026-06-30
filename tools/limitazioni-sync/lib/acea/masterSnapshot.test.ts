import { describe, it, expect } from 'vitest';
import { mappaMasterSnapshot } from './masterSnapshot.mjs';

describe('mappaMasterSnapshot', () => {
  it('mappa le righe grezze del master a snapshot {odl, attivita, ...} scartando gli ODL vuoti', () => {
    const grezze = [
      { odl: ' 957276080 ', attivita: 'LIMITAZIONE', esecutore: 'ROSSI', dataRaw: '01/06/2026', statoRaw: 'eseguito', matricola: 'M1', comune: 'ROMA' },
      { odl: '', attivita: 'X' }, // scartata
      { odl: 'A2' }, // campi mancanti → stringhe vuote
    ];
    const out = mappaMasterSnapshot(grezze);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      odl: '957276080',
      attivita: 'LIMITAZIONE',
      esecutore: 'ROSSI',
      dataRaw: '01/06/2026',
      statoRaw: 'eseguito',
      matricola: 'M1',
      comune: 'ROMA',
    });
    expect(out[1]).toEqual({ odl: 'A2', attivita: '', esecutore: '', dataRaw: '', statoRaw: '', matricola: '', comune: '' });
  });

  it('input vuoto → array vuoto', () => {
    expect(mappaMasterSnapshot([])).toEqual([]);
  });
});
