import { describe, it, expect } from 'vitest';
import { cognomeDaDisplayName } from './exportLimMassive';

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
