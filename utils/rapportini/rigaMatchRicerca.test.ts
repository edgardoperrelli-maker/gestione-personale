import { describe, it, expect } from 'vitest';
import { rigaMatchRicerca } from './rigaMatchRicerca';

const riga = { matricola: '99A023041', via: 'Corso Garibaldi 131', odl: '912228701' };

describe('rigaMatchRicerca', () => {
  it('query vuota → true', () => {
    expect(rigaMatchRicerca(riga, '')).toBe(true);
    expect(rigaMatchRicerca(riga, '   ')).toBe(true);
  });
  it('match parziale su via (case-insensitive)', () => {
    expect(rigaMatchRicerca(riga, 'garib')).toBe(true);
  });
  it('match su ODS/ODL', () => {
    expect(rigaMatchRicerca(riga, '9122')).toBe(true);
  });
  it('match su matricola normalizzata (anche con spazi/trattini nella query)', () => {
    expect(rigaMatchRicerca(riga, 'a023041')).toBe(true);
    expect(rigaMatchRicerca(riga, 'A-023 041')).toBe(true);
  });
  it('nessun match → false; campi assenti gestiti', () => {
    expect(rigaMatchRicerca(riga, 'zzz999')).toBe(false);
    expect(rigaMatchRicerca({}, 'garib')).toBe(false);
  });
});
