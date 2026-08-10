import { describe, it, expect } from 'vitest';
import { riapribile } from './riaperturaRifiuto';
import { STATI_RICHIESTA } from './types';

describe('riapribile', () => {
  it('rifiutato → si riapre (è il caso del rifiuto per errore)', () => {
    expect(riapribile('rifiutato')).toBe(true);
  });

  it('in_attesa → niente da riaprire: è già in coda', () => {
    expect(riapribile('in_attesa')).toBe(false);
  });

  it('approvato e auto_liberi → no: l’intervento canonico esiste già', () => {
    expect(riapribile('approvato')).toBe(false);
    expect(riapribile('auto_liberi')).toBe(false);
  });

  it('annullato → no: l’annullamento ha cancellato la voce del rapportino', () => {
    expect(riapribile('annullato')).toBe(false);
  });

  it('stato assente o sconosciuto → no', () => {
    expect(riapribile(null)).toBe(false);
    expect(riapribile(undefined)).toBe(false);
    expect(riapribile('boh')).toBe(false);
  });

  it('esattamente uno stato del dominio è riapribile', () => {
    expect(STATI_RICHIESTA.filter(riapribile)).toEqual(['rifiutato']);
  });
});
