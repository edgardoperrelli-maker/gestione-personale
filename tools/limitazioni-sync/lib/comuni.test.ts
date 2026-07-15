import { describe, it, expect } from 'vitest';
// @ts-expect-error modulo .mjs senza tipi
import { TUTTI, comuneDaFile, normalizzaComune, filtraFilePerComune } from './comuni.mjs';

describe('comuneDaFile', () => {
  it('prende il nome del file senza estensione, in maiuscolo', () => {
    expect(comuneDaFile('C:\\x\\LIMITAZIONI MASSIVE\\LABICO.xlsx')).toBe('LABICO');
    expect(comuneDaFile('/tmp/zagarolo.xlsx')).toBe('ZAGAROLO');
  });

  it('tollera estensione maiuscola e spazi nel nome', () => {
    expect(comuneDaFile('C:\\x\\Labico.XLSX')).toBe('LABICO');
    expect(comuneDaFile('C:\\x\\ SAN CESAREO .xlsx')).toBe('SAN CESAREO');
  });

  it('non si spezza su input vuoti', () => {
    expect(comuneDaFile('')).toBe('');
    expect(comuneDaFile(null)).toBe('');
  });
});

describe('normalizzaComune', () => {
  it('vuoto/null → TUTTI', () => {
    expect(normalizzaComune('')).toBe(TUTTI);
    expect(normalizzaComune(null)).toBe(TUTTI);
    expect(normalizzaComune(undefined)).toBe(TUTTI);
    expect(normalizzaComune('   ')).toBe(TUTTI);
  });

  it('normalizza maiuscole e spazi', () => {
    expect(normalizzaComune(' labico ')).toBe('LABICO');
    expect(normalizzaComune('tutti')).toBe(TUTTI);
  });
});

describe('filtraFilePerComune', () => {
  const files = [
    'C:\\c\\LABICO.xlsx',
    'C:\\c\\ZAGAROLO.xlsx',
    'C:\\c\\SAN CESAREO.xlsx',
  ];

  it('TUTTI → nessun filtro', () => {
    expect(filtraFilePerComune(files, TUTTI)).toEqual(files);
    expect(filtraFilePerComune(files, '')).toEqual(files);
    expect(filtraFilePerComune(files, null)).toEqual(files);
  });

  it('un comune → solo il suo file', () => {
    expect(filtraFilePerComune(files, 'LABICO')).toEqual(['C:\\c\\LABICO.xlsx']);
    expect(filtraFilePerComune(files, 'labico')).toEqual(['C:\\c\\LABICO.xlsx']);
  });

  it('comune senza file → lista vuota (non tutti!)', () => {
    // Regressione da evitare: un filtro che non aggancia NON deve degradare a "tutti i comuni",
    // altrimenti un refuso nel menu scriverebbe su tutti i master invece che su nessuno.
    expect(filtraFilePerComune(files, 'PALESTRINA')).toEqual([]);
  });

  it('non si spezza su lista vuota', () => {
    expect(filtraFilePerComune([], 'LABICO')).toEqual([]);
    expect(filtraFilePerComune(undefined, TUTTI)).toEqual([]);
  });
});
