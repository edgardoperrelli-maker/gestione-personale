import { describe, it, expect } from 'vitest';
import { cognomeDaDisplayName, esitoFileDaIntervento } from './exportLimMassive';

describe('cognomeDaDisplayName', () => {
  it('prende il primo token (cognome) in maiuscolo', () => {
    expect(cognomeDaDisplayName('CIARALLO SIMONE')).toBe('CIARALLO');
    expect(cognomeDaDisplayName('PASTORELLI LUIGI')).toBe('PASTORELLI');
  });
  it('gestisce stringa vuota e spazi', () => {
    expect(cognomeDaDisplayName('')).toBe('');
    expect(cognomeDaDisplayName('  rossi  ')).toBe('ROSSI');
    expect(cognomeDaDisplayName(null)).toBe('');
  });
});

describe('esitoFileDaIntervento', () => {
  it('positivo → eseguito', () => {
    expect(esitoFileDaIntervento('completato', 'eseguito_positivo')).toBe('eseguito');
  });
  it('completato non positivo → No', () => {
    expect(esitoFileDaIntervento('completato', null)).toBe('No');
    expect(esitoFileDaIntervento('completato', 'accesso_negato')).toBe('No');
    expect(esitoFileDaIntervento('completato', 'contatore_non_trovato')).toBe('No');
  });
  it('non completato → null (non lavorato)', () => {
    expect(esitoFileDaIntervento('assegnato', 'eseguito_positivo')).toBeNull();
    expect(esitoFileDaIntervento(null, null)).toBeNull();
  });
});
