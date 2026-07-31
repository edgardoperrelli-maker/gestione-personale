import { describe, it, expect } from 'vitest';
import { idPianiPerLettura } from './idPiani';

describe('idPianiPerLettura', () => {
  it('toglie i null: sono i rapportini-contenitore della Consuntivazione', () => {
    expect(idPianiPerLettura([{ piano_id: 'p1' }, { piano_id: null }, { piano_id: 'p2' }]))
      .toEqual(['p1', 'p2']);
  });

  it('deduplica: più operatori sullo stesso piano = un solo id', () => {
    expect(idPianiPerLettura([{ piano_id: 'p1' }, { piano_id: 'p1' }])).toEqual(['p1']);
  });

  it('scarta anche la stringa vuota (mai un uuid valido)', () => {
    expect(idPianiPerLettura([{ piano_id: '' }, { piano_id: 'p1' }])).toEqual(['p1']);
  });

  it('tutti senza piano → lista vuota, e il chiamante salta la query', () => {
    expect(idPianiPerLettura([{ piano_id: null }, { piano_id: null }])).toEqual([]);
  });

  it('nessun elemento è null: è la condizione che PostgREST pretende su una colonna uuid', () => {
    const out = idPianiPerLettura([{ piano_id: null }, { piano_id: 'p1' }, { piano_id: null }]);
    expect(out.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
  });
});
