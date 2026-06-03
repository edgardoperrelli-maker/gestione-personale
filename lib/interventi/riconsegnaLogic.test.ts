import { describe, it, expect } from 'vitest';
import { PENALE_MISURATORE, calcolaPenale, riepilogoCesta } from './riconsegnaLogic';

describe('calcolaPenale', () => {
  it('€1.000 per ogni misuratore mancante', () => {
    expect(PENALE_MISURATORE).toBe(1000);
    expect(calcolaPenale([{ stato: 'mancante' }, { stato: 'consegnato' }, { stato: 'mancante' }])).toBe(2000);
  });
  it('nessun mancante → penale 0', () => {
    expect(calcolaPenale([{ stato: 'consegnato' }, { stato: 'in_custodia' }])).toBe(0);
  });
});

describe('riepilogoCesta', () => {
  it('conta per stato e calcola la penale', () => {
    const r = riepilogoCesta([
      { stato: 'consegnato' },
      { stato: 'consegnato' },
      { stato: 'mancante' },
      { stato: 'in_custodia' },
      { stato: 'in_riepilogo' },
    ]);
    expect(r).toEqual({ totale: 5, consegnati: 2, mancanti: 1, daConsegnare: 2, penale: 1000 });
  });
  it('cesta vuota', () => {
    expect(riepilogoCesta([])).toEqual({ totale: 0, consegnati: 0, mancanti: 0, daConsegnare: 0, penale: 0 });
  });
});
