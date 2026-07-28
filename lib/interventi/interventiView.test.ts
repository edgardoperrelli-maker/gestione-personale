import { describe, it, expect } from 'vitest';
import { labelStato } from './interventiView';

// Le suite di `parseInterventiFilters` e `badgeGeocode` sono state rimosse col codice
// che coprivano (2026-07-27): erano gli unici importatori rimasti di quelle funzioni,
// cioè un test che teneva in vita ciò che doveva sorvegliare.

describe('labelStato', () => {
  it('mappa gli stati noti', () => {
    expect(labelStato('da_assegnare')).toBe('Da assegnare');
    expect(labelStato('in_esecuzione')).toBe('In esecuzione');
  });
  it('gestisce null e sconosciuti', () => {
    expect(labelStato(null)).toBe('—');
    expect(labelStato('boh')).toBe('boh');
  });
});
