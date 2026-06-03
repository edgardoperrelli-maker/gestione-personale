import { describe, it, expect } from 'vitest';
import { detectFormat } from './excelParser';

const HEADER = [
  'CO', 'MATRICOLA', 'Id', 'ODSIN', 'Indirizzo', 'CAP', 'COMUNE',
  'Tipo OdL(CdL)/Servizio', 'Fascia Appuntamento/Blocco', 'PdR / Impianto', 'Nominativo',
];

describe('detectFormat — Export Dati', () => {
  it('mappa la colonna MATRICOLA', () => {
    const cols = detectFormat(HEADER);
    expect(cols).not.toBeNull();
    expect(cols!.matricola).toBe(1);
    expect(cols!.via).toBe(4); // Indirizzo
    expect(cols!.nominativo).toBe(10);
  });

  it('senza MATRICOLA → matricola null (parsing intatto)', () => {
    const cols = detectFormat([
      'CO', 'Id', 'ODSIN', 'Indirizzo', 'CAP', 'COMUNE', 'PdR / Impianto', 'Nominativo',
    ]);
    expect(cols!.matricola).toBeNull();
    expect(cols!.via).toBe(3);
  });
});
