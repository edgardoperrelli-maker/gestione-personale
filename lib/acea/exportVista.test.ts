import { describe, it, expect } from 'vitest';
import {
  MAX_RIGHE_EXPORT, PER_PAGINA_EXPORT, nomeFileExport, pagineExport,
} from './exportVista';

describe('pagineExport', () => {
  it('copre tutte le righe, ultima pagina parziale compresa', () => {
    // 5.293 righe a 500 per volta: 11 richieste, l'ultima con 293 righe. È il caso reale del
    // registro, ed è quello che prima usciva come un file da 300 righe.
    const pagine = pagineExport(5293);
    expect(pagine).toHaveLength(11);
    expect(pagine.at(0)).toBe(1);
    expect(pagine.at(-1)).toBe(11);
    expect((pagine.length - 1) * PER_PAGINA_EXPORT).toBeLessThan(5293);
  });

  it('una pagina esatta non ne aggiunge una vuota', () => {
    expect(pagineExport(500)).toEqual([1]);
    expect(pagineExport(1000)).toEqual([1, 2]);
  });

  it('meno di una pagina resta una pagina', () => {
    expect(pagineExport(1)).toEqual([1]);
    expect(pagineExport(499)).toEqual([1]);
  });

  it('senza righe non chiede niente', () => {
    expect(pagineExport(0)).toEqual([]);
    expect(pagineExport(-3)).toEqual([]);
    expect(pagineExport(Number.NaN)).toEqual([]);
  });

  it('il tetto è abbastanza alto da non incontrarsi sul registro attuale', () => {
    expect(MAX_RIGHE_EXPORT).toBeGreaterThan(5293);
  });
});

describe('nomeFileExport', () => {
  const base = { famiglia: 'dunning', stato: 'aperti', oggi: '2026-07-27', filtrato: false } as const;

  it('porta famiglia, stato e giorno', () => {
    expect(nomeFileExport(base)).toBe('acea-dunning-aperti-20260727.xlsx');
  });

  it('lo stato compare SEMPRE, anche quello di partenza', () => {
    // La vista iniziale è già ristretta agli aperti: un file chiamato `acea-dunning-<data>` farebbe
    // credere che dentro ci sia tutto il registro della famiglia.
    for (const stato of ['tutti', 'aperti', 'chiusi'] as const) {
      expect(nomeFileExport({ ...base, stato })).toContain(`-${stato}-`);
    }
  });

  it('marca il file quando i filtri hanno ristretto la vista', () => {
    expect(nomeFileExport({ ...base, filtrato: true })).toBe('acea-dunning-aperti-20260727-filtrato.xlsx');
  });

  it('senza un giorno valido salta il segmento invece di scrivere una data finta', () => {
    expect(nomeFileExport({ ...base, oggi: '' })).toBe('acea-dunning-aperti.xlsx');
    expect(nomeFileExport({ ...base, oggi: '27/07/2026' })).toBe('acea-dunning-aperti.xlsx');
  });

  it('distingue le due famiglie', () => {
    expect(nomeFileExport({ ...base, famiglia: 'massive' })).toContain('acea-massive-');
  });

  it('la scheda-comune entra nel nome: il file di un paese deve dirlo', () => {
    expect(nomeFileExport({ ...base, famiglia: 'massive', comune: 'ZAGAROLO' }))
      .toBe('acea-massive-zagarolo-aperti-20260727.xlsx');
    // Gli spazi diventano trattini: 'RIGNANO FLAMINIO' non deve produrre un nome con spazi.
    expect(nomeFileExport({ ...base, famiglia: 'massive', comune: 'RIGNANO FLAMINIO' }))
      .toBe('acea-massive-rignano-flaminio-aperti-20260727.xlsx');
  });

  it('senza scheda-comune il nome resta quello di sempre', () => {
    expect(nomeFileExport({ ...base, comune: null })).toBe('acea-dunning-aperti-20260727.xlsx');
  });
});
