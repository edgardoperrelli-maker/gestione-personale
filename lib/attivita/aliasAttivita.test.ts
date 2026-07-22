import { describe, it, expect } from 'vitest';
import {
  ALIAS_ATTIVITA, ALIAS_ATTIVITA_SCRITTURA, allineaChiaveAttivita, allineaAttivitaQualsiasi,
} from './aliasAttivita';
import { chiaveTassonomia } from './tassonomia';

describe('alias attività', () => {
  it('chiavi ben formate: `committente|NORM` con NORM già normalizzato', () => {
    for (const chiave of Object.keys(ALIAS_ATTIVITA)) {
      const sep = chiave.indexOf('|');
      expect(sep).toBeGreaterThan(0);
      const committente = chiave.slice(0, sep);
      const norm = chiave.slice(sep + 1);
      expect(committente).toBe(committente.toLowerCase());
      expect(chiaveTassonomia(norm)).toBe(norm);
    }
  });
  it('canonici normalizzati, diversi dalla variante, nessun self/ciclo', () => {
    for (const [chiave, canonica] of Object.entries(ALIAS_ATTIVITA)) {
      const norm = chiave.slice(chiave.indexOf('|') + 1);
      const committente = chiave.slice(0, chiave.indexOf('|'));
      expect(canonica).not.toBe(norm);
      expect(chiaveTassonomia(canonica)).toBe(canonica);
      expect(allineaChiaveAttivita(committente, canonica, 'lettura')).toBe(canonica); // il canonico non è a sua volta variante
    }
  });
  it('tier scrittura ⊆ tier lettura', () => {
    for (const [k, v] of Object.entries(ALIAS_ATTIVITA_SCRITTURA)) {
      expect(ALIAS_ATTIVITA[k]).toBe(v);
    }
  });
  it('scrittura conserva il dettaglio ATLAS; lettura collassa al codice nudo', () => {
    // Storage: il dettaglio resta (import committente + export/riconciliazione).
    expect(allineaChiaveAttivita('italgas', 'S-PR-003 A', 'scrittura')).toBe('S-PR-003 A');
    // Lettura (display/dedup): collasso al codice nudo.
    expect(allineaChiaveAttivita('italgas', 'S-PR-003 A', 'lettura')).toBe('S-PR-003');
    expect(allineaChiaveAttivita('italgas', 'DIS00N - DISATTIVAZIONE SUCCESSIVO PASSAGGIO', 'lettura')).toBe('DIS00N');
  });
  it('TUTTE le varianti (tier completo) univoche tra committenti (dedup agnostico sicuro)', () => {
    const perNorm = new Map<string, string>();
    for (const [k, v] of Object.entries(ALIAS_ATTIVITA)) {
      const norm = k.slice(k.indexOf('|') + 1);
      const prima = perNorm.get(norm);
      if (prima !== undefined) expect(prima).toBe(v); // stessa norm ⇒ stessa canonica (no ambiguità)
      perNorm.set(norm, v);
      expect(allineaAttivitaQualsiasi(norm)).toBe(v); // agnostico = tier lettura completo
    }
  });
  it('dedup agnostico collassa le varianti ATLAS al codice nudo', () => {
    expect(allineaAttivitaQualsiasi('DIS00N - DISATTIVAZIONE SUCCESSIVO PASSAGGIO')).toBe('DIS00N');
    expect(allineaAttivitaQualsiasi('S-PR-003 A')).toBe('S-PR-003');
    expect(allineaAttivitaQualsiasi('LIMITAZIONE MASSIVA')).toBe('LIMITAZIONI MASSIVE');
  });
  it('lascia invariato ciò che non è alias', () => {
    expect(allineaChiaveAttivita('acea', 'BONIFICHE')).toBe('BONIFICHE');
    expect(allineaChiaveAttivita('italgas', 'S-PR-003')).toBe('S-PR-003'); // il codice nudo è la canonica
    expect(allineaAttivitaQualsiasi('PICARRO')).toBe('PICARRO');
  });
});
