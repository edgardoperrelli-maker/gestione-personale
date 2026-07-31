import { describe, expect, it } from 'vitest';
import { SENZA_PALLET, filtraPerPallet, valoriPallet } from './pallet';

const riga = (pallet: string | null | undefined) => ({ pallet });

describe('valoriPallet', () => {
  it('deduplica e ignora vuoti e nulli', () => {
    expect(valoriPallet([riga('3'), riga('3'), riga(''), riga('  '), riga(null), riga(undefined)]))
      .toEqual(['3']);
  });

  it('tutti numerici → ordine da numeri (1, 2, 10 — non 1, 10, 2)', () => {
    expect(valoriPallet([riga('10'), riga('2'), riga('1')])).toEqual(['1', '2', '10']);
  });

  it('basta un valore non numerico e si ordina da testo, tutto insieme', () => {
    expect(valoriPallet([riga('PLT-2'), riga('10'), riga('PLT-1')]))
      .toEqual(['10', 'PLT-1', 'PLT-2']);
  });
});

describe('filtraPerPallet', () => {
  const righe = [riga('1'), riga('2'), riga(null), riga('')];

  it("'' non filtra: tutte le righe", () => {
    expect(filtraPerPallet(righe, '')).toHaveLength(4);
  });

  it('«Senza pallet» prende nulli e vuoti: è ciò che è ancora in cesta', () => {
    expect(filtraPerPallet(righe, SENZA_PALLET)).toHaveLength(2);
  });

  it('un valore prende solo il suo pallet, tollerando gli spazi scritti a mano', () => {
    expect(filtraPerPallet([riga(' 1 '), riga('1'), riga('2')], '1')).toHaveLength(2);
  });
});
