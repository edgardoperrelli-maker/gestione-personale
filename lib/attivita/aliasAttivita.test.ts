import { describe, it, expect } from 'vitest';
import { ALIAS_ATTIVITA, allineaChiaveAttivita } from './aliasAttivita';
import { chiaveTassonomia } from './tassonomia';

describe('alias attività', () => {
  it('chiavi ben formate: `committente|NORM` con NORM già normalizzato', () => {
    for (const chiave of Object.keys(ALIAS_ATTIVITA)) {
      const sep = chiave.indexOf('|');
      expect(sep).toBeGreaterThan(0);
      const committente = chiave.slice(0, sep);
      const norm = chiave.slice(sep + 1);
      expect(committente).toBe(committente.toLowerCase());
      // la variante è già nella forma normalizzata (idempotente)
      expect(chiaveTassonomia(norm)).toBe(norm);
    }
  });
  it('valori canonici già normalizzati e diversi dalla variante (nessun self/ciclo)', () => {
    for (const [chiave, canonica] of Object.entries(ALIAS_ATTIVITA)) {
      const norm = chiave.slice(chiave.indexOf('|') + 1);
      expect(canonica).not.toBe(norm);
      expect(chiaveTassonomia(canonica)).toBe(canonica);
      // il canonico non è a sua volta una variante (no doppio salto)
      const committente = chiave.slice(0, chiave.indexOf('|'));
      expect(allineaChiaveAttivita(committente, canonica)).toBe(canonica);
    }
  });
  it('lascia invariato ciò che non è alias', () => {
    expect(allineaChiaveAttivita('acea', 'BONIFICHE')).toBe('BONIFICHE');
    expect(allineaChiaveAttivita('italgas', 'S-PR-003 A')).toBe('S-PR-003 A');
  });
});
