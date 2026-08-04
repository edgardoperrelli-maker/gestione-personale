// utils/rapportini/opzioniEsito.test.ts
// Gli editor di correzione devono poter scrivere TUTTI gli esiti canonici anche sugli
// snapshot storici nati prima (es. voci AcquaLatina esitate quando «NESSUN PASSAGGIO»
// non esisteva ancora).
import { describe, it, expect } from 'vitest';
import { opzioniEsitoGarantite, campiConEsitoCorreggibile } from './opzioniEsito';
import type { TemplateCampo } from './buildVoci';

const c = (p: Partial<TemplateCampo> & { chiave: string; tipo: TemplateCampo['tipo'] }): TemplateCampo => ({
  etichetta: p.chiave, ordine: 0, ...p,
});

describe('opzioniEsitoGarantite', () => {
  it('snapshot pre-«NESSUN PASSAGGIO» (SI/NO) → lo aggiunge in coda', () => {
    expect(opzioniEsitoGarantite(['SI', 'NO'])).toEqual(['SI', 'NO', 'NESSUN PASSAGGIO']);
  });
  it('solo positivo → aggiunge NO e NESSUN PASSAGGIO', () => {
    expect(opzioniEsitoGarantite(['SI'])).toEqual(['SI', 'NO', 'NESSUN PASSAGGIO']);
  });
  it('senza opzioni → i tre canonici', () => {
    expect(opzioniEsitoGarantite(undefined)).toEqual(['SI', 'NO', 'NESSUN PASSAGGIO']);
  });
  it('già completo → ordine e casing intatti', () => {
    expect(opzioniEsitoGarantite(['SI', 'NESSUN PASSAGGIO', 'NO'])).toEqual(['SI', 'NESSUN PASSAGGIO', 'NO']);
  });
  it('varianti di casing/spazi riconosciute come presenti (non duplica)', () => {
    expect(opzioniEsitoGarantite(['Si', ' nessun passaggio ', 'no'])).toEqual(['Si', ' nessun passaggio ', 'no']);
  });
});

describe('campiConEsitoCorreggibile', () => {
  it('tocca solo le select d’esito; select secondarie e altri tipi intatti', () => {
    const campi = campiConEsitoCorreggibile([
      c({ chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 }),
      c({ chiave: 'sostituzione_valvola', etichetta: 'Sostituzione valvola', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 2 }),
      c({ chiave: 'note', tipo: 'testo', ordine: 3 }),
    ]);
    expect(campi.find((x) => x.chiave === 'eseguito')?.opzioni).toEqual(['SI', 'NO', 'NESSUN PASSAGGIO']);
    expect(campi.find((x) => x.chiave === 'sostituzione_valvola')?.opzioni).toEqual(['SI', 'NO']);
    expect(campi.find((x) => x.chiave === 'note')?.opzioni).toBeUndefined();
  });
});
