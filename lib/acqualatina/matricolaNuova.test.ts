import { describe, it, expect } from 'vitest';
import { valoreMatricolaNuova } from './matricolaNuova';

describe('valoreMatricolaNuova', () => {
  it('taglia gli spazi', () => {
    expect(valoreMatricolaNuova('  NUOVA999  ')).toBe('NUOVA999');
  });

  it('stringa vuota o solo spazi → null', () => {
    expect(valoreMatricolaNuova('')).toBeNull();
    expect(valoreMatricolaNuova('   ')).toBeNull();
  });

  it('null/undefined → null', () => {
    expect(valoreMatricolaNuova(null)).toBeNull();
    expect(valoreMatricolaNuova(undefined)).toBeNull();
  });

  it('non cambia le maiuscole: non è compito suo', () => {
    expect(valoreMatricolaNuova('nuova999')).toBe('nuova999');
  });

  it('valori non stringa vengono convertiti', () => {
    expect(valoreMatricolaNuova(12345)).toBe('12345');
  });
});
