import { describe, it, expect } from 'vitest';
import { aggregaSaracinescaPerOdl, type RigaSaracinescaDb } from './aceaSaracinesche';

describe('aggregaSaracinescaPerOdl', () => {
  it('SI (booleano) → l\'ODL entra nel risultato', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: '957276080', sostituzione_valvola: true, sost_valvola: null },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([{ odl: '957276080', saracinesca: 'SI' }]);
  });

  it('SI (stringa) → l\'ODL entra nel risultato', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: '957276080', sostituzione_valvola: 'SI', sost_valvola: null },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([{ odl: '957276080', saracinesca: 'SI' }]);
  });

  it('dedup: due righe sullo stesso odl, una SI e una vuota → SI vince, un solo risultato', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: '111', sostituzione_valvola: null, sost_valvola: null },
      { odl: '111', sostituzione_valvola: true, sost_valvola: null },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([{ odl: '111', saracinesca: 'SI' }]);
  });

  it('valore diverso da SI (es. "NO" o testo libero) → l\'odl NON entra', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: '222', sostituzione_valvola: 'NO', sost_valvola: null },
      { odl: '333', sostituzione_valvola: 'inserimento valvola', sost_valvola: null },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([]);
  });

  it('percorso foto (path/link) → scartato, l\'odl NON entra', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: '444', sostituzione_valvola: null, sost_valvola: 'rapportini/abc/x.jpg' },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([]);
  });

  it('odl vuoto o null → riga ignorata anche se saracinesca SI', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: null, sostituzione_valvola: true, sost_valvola: null },
      { odl: '  ', sostituzione_valvola: true, sost_valvola: null },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([]);
  });

  it('odl trimmato nell\'output', () => {
    const righe: RigaSaracinescaDb[] = [
      { odl: '  957276080  ', sostituzione_valvola: true, sost_valvola: null },
    ];
    expect(aggregaSaracinescaPerOdl(righe)).toEqual([{ odl: '957276080', saracinesca: 'SI' }]);
  });

  it('array vuoto → risultato vuoto', () => {
    expect(aggregaSaracinescaPerOdl([])).toEqual([]);
  });
});
