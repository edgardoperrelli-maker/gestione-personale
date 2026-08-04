import { describe, expect, it } from 'vitest';
import { SENZA_RIFERIMENTO, filtraPerRiferimento, valoriRiferimento } from './riferimenti';

const riga = (cesta: string | null | undefined) => ({ cesta });

describe('valoriRiferimento', () => {
  it('deduplica e ignora vuoti e nulli', () => {
    expect(valoriRiferimento([riga('3'), riga('3'), riga(''), riga('  '), riga(null), riga(undefined)]))
      .toEqual(['3']);
  });

  it('tutte numeriche → ordine da numeri (1, 2, 10 — non 1, 10, 2)', () => {
    expect(valoriRiferimento([riga('10'), riga('2'), riga('1')])).toEqual(['1', '2', '10']);
  });

  it('basta un valore non numerico e si ordina da testo, tutto insieme', () => {
    expect(valoriRiferimento([riga('A-2'), riga('10'), riga('A-1')]))
      .toEqual(['10', 'A-1', 'A-2']);
  });
});

describe('filtraPerRiferimento', () => {
  const righe = [riga('1'), riga('2'), riga(null), riga('')];

  it("'' non filtra: tutte le righe", () => {
    expect(filtraPerRiferimento(righe, '')).toHaveLength(4);
  });

  it('«Senza cesta» prende nulli e vuoti: è ciò che è ancora in furgone', () => {
    expect(filtraPerRiferimento(righe, SENZA_RIFERIMENTO)).toHaveLength(2);
  });

  it('un valore prende solo la sua cesta, tollerando gli spazi scritti a mano', () => {
    expect(filtraPerRiferimento([riga(' 1 '), riga('1'), riga('2')], '1')).toHaveLength(2);
  });

  it('la sentinella non può collidere con una cesta scritta a mano', () => {
    // Se qualcuno scrivesse davvero `__senza__` come numero di cesta, il filtro «Senza cesta»
    // pescherebbe le sue righe insieme a quelle vuote. Il valore è scelto perché non è un
    // riferimento plausibile: il test tiene ferma la ragione, non la stringa.
    expect(SENZA_RIFERIMENTO).toMatch(/^__/);
    expect(filtraPerRiferimento([riga(SENZA_RIFERIMENTO)], SENZA_RIFERIMENTO)).toHaveLength(0);
  });
});
