// utils/rapportini/territorioEffettivo.test.ts
import { describe, it, expect } from 'vitest';
import { territorioEffettivo } from './territorioEffettivo';

describe('territorioEffettivo', () => {
  it("usa l'override quando valorizzato", () => {
    expect(territorioEffettivo('ACEA', 'Firenze')).toBe('ACEA');
  });
  it('ignora override vuoto/spazi e usa il territorio del piano', () => {
    expect(territorioEffettivo('   ', 'Firenze')).toBe('Firenze');
    expect(territorioEffettivo(null, 'Firenze')).toBe('Firenze');
    expect(territorioEffettivo(undefined, 'Firenze')).toBe('Firenze');
  });
  it('ritorna null se entrambi vuoti', () => {
    expect(territorioEffettivo(null, null)).toBeNull();
    expect(territorioEffettivo('', '  ')).toBeNull();
  });
});
