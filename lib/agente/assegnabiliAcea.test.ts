import { describe, it, expect } from 'vitest';
import { assegnabiliAcea } from './assegnabiliAcea';

const staff = { s1: 'ROSSI Mario', s2: 'VERDI Anna' };

describe('assegnabiliAcea', () => {
  it('produce le righe assegnabili risolvendo il nome operatore', () => {
    const interventi = [
      { id: 'i1', odl: '111', matricola_contatore: 'M1', indirizzo: 'Via A', comune: 'ROMA', staff_id: 's1' },
    ];
    const r = assegnabiliAcea(interventi, staff, new Set());
    expect(r.righe).toEqual([{ interventoId: 'i1', odl: '111', matricola: 'M1', indirizzo: 'Via A', comune: 'ROMA', staffId: 's1', operatoreAcea: 'ROSSI Mario' }]);
    expect(r.scartati).toEqual([]);
  });

  it('scarta odl mancante, operatore non risolto, già assegnato', () => {
    const interventi = [
      { id: 'i1', odl: '', matricola_contatore: null, indirizzo: null, comune: null, staff_id: 's1' },
      { id: 'i2', odl: '222', matricola_contatore: null, indirizzo: null, comune: null, staff_id: 'sX' },
      { id: 'i3', odl: '333', matricola_contatore: null, indirizzo: null, comune: null, staff_id: 's2' },
    ];
    const r = assegnabiliAcea(interventi, staff, new Set(['333']));
    expect(r.righe).toEqual([]);
    expect(r.scartati).toEqual([
      { odl: '', motivo: 'odl mancante' },
      { odl: '222', motivo: 'operatore non risolto' },
      { odl: '333', motivo: 'già assegnato' },
    ]);
  });
});
