import { describe, it, expect } from 'vitest';
import { riepilogoScarico, tuttiConsegnati } from './riconsegnaLogic';

describe('riepilogoScarico', () => {
  it('conta per stato (consegnati / mancanti / da controllare)', () => {
    const r = riepilogoScarico([
      { stato: 'consegnato' },
      { stato: 'consegnato' },
      { stato: 'mancante' },
      { stato: 'in_custodia' },
      { stato: 'in_riepilogo' },
    ]);
    expect(r).toEqual({ totale: 5, consegnati: 2, mancanti: 1, daControllare: 2 });
  });

  it('cesta vuota', () => {
    expect(riepilogoScarico([])).toEqual({ totale: 0, consegnati: 0, mancanti: 0, daControllare: 0 });
  });
});

describe('tuttiConsegnati', () => {
  it('true solo se tutti i misuratori risultano consegnati', () => {
    expect(tuttiConsegnati([{ stato: 'consegnato' }, { stato: 'consegnato' }])).toBe(true);
  });
  it('false se ne manca anche uno', () => {
    expect(tuttiConsegnati([{ stato: 'consegnato' }, { stato: 'mancante' }])).toBe(false);
    expect(tuttiConsegnati([{ stato: 'consegnato' }, { stato: 'in_custodia' }])).toBe(false);
  });
  it('false su lista vuota (niente da confermare)', () => {
    expect(tuttiConsegnati([])).toBe(false);
  });
});
