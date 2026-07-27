import { describe, it, expect } from 'vitest';
import {
  esecutoreIdValido, scegliRapportinoDestinazione, prossimoOrdine, esecutoriConNuovoPrimario,
} from './esecutore';

const UUID_A = '95b59ec2-e364-4e78-a045-b3ca460cd02f';
const UUID_B = 'b2330af0-0da9-41f2-9caa-6c7099f8a302';

describe('esecutoreIdValido', () => {
  it('accetta un uuid (con trim) e lo restituisce normalizzato', () => {
    expect(esecutoreIdValido(`  ${UUID_A}  `)).toBe(UUID_A);
  });

  it('rifiuta chiave assente, stringa vuota e valori non uuid', () => {
    expect(esecutoreIdValido(undefined)).toBeNull();
    expect(esecutoreIdValido('')).toBeNull();
    expect(esecutoreIdValido('CIARALLO SIMONE')).toBeNull();
    expect(esecutoreIdValido(42)).toBeNull();
  });
});

describe('scegliRapportinoDestinazione', () => {
  const origine = { piano_id: 'piano-1', tipo: 'standard' };

  it('preferisce il rapportino dello stesso piano dell origine', () => {
    const scelto = scegliRapportinoDestinazione([
      { id: 'r-altro', piano_id: 'piano-2', tipo: 'standard' },
      { id: 'r-giusto', piano_id: 'piano-1', tipo: 'standard' },
    ], origine);
    expect(scelto).toBe('r-giusto');
  });

  it('senza lo stesso piano preferisce comunque un rapportino di piano al contenitore', () => {
    const scelto = scegliRapportinoDestinazione([
      { id: 'r-contenitore', piano_id: null, tipo: 'standard' },
      { id: 'r-piano', piano_id: 'piano-9', tipo: 'standard' },
    ], origine);
    expect(scelto).toBe('r-piano');
  });

  it('scarta i rapportini di tipo diverso: una voce standard non entra in un risanamento', () => {
    expect(scegliRapportinoDestinazione([{ id: 'r-ris', piano_id: null, tipo: 'risanamento' }], origine)).toBeNull();
  });

  it('tipo null vale standard su entrambi i lati', () => {
    const scelto = scegliRapportinoDestinazione(
      [{ id: 'r1', piano_id: null, tipo: null }],
      { piano_id: null, tipo: null },
    );
    expect(scelto).toBe('r1');
  });

  it('nessun candidato → null (il chiamante crea il contenitore)', () => {
    expect(scegliRapportinoDestinazione([], origine)).toBeNull();
  });
});

describe('prossimoOrdine', () => {
  it('accoda in fondo', () => {
    expect(prossimoOrdine([1, 5, 3])).toBe(6);
  });

  it('rapportino vuoto o ordini nulli → 1', () => {
    expect(prossimoOrdine([])).toBe(1);
    expect(prossimoOrdine([null, null])).toBe(1);
  });
});

describe('esecutoriConNuovoPrimario', () => {
  it('sostituisce il primario e conserva la squadra', () => {
    const out = esecutoriConNuovoPrimario(
      [{ staff_id: UUID_B, staff_name: 'PICCININI FEDERICO' }, { staff_id: 'x', staff_name: 'TERZO' }],
      { staff_id: UUID_A, staff_name: 'CIARALLO SIMONE' },
    );
    expect(out).toEqual([
      { staff_id: UUID_A, staff_name: 'CIARALLO SIMONE' },
      { staff_id: 'x', staff_name: 'TERZO' },
    ]);
  });

  it('nuovo primario già comprimario → niente doppione', () => {
    const out = esecutoriConNuovoPrimario(
      [{ staff_id: UUID_B, staff_name: 'PICCININI FEDERICO' }, { staff_id: UUID_A, staff_name: 'CIARALLO SIMONE' }],
      { staff_id: UUID_A, staff_name: 'CIARALLO SIMONE' },
    );
    expect(out).toEqual([{ staff_id: UUID_A, staff_name: 'CIARALLO SIMONE' }]);
  });

  it('lista vuota o non-array → null (la popola solo la consuntivazione)', () => {
    expect(esecutoriConNuovoPrimario([], { staff_id: UUID_A, staff_name: 'X' })).toBeNull();
    expect(esecutoriConNuovoPrimario(null, { staff_id: UUID_A, staff_name: 'X' })).toBeNull();
  });
});
