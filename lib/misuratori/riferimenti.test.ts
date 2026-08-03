import { describe, expect, it } from 'vitest';
import { SENZA_RIFERIMENTO, filtraPerRiferimento, valoriRiferimento } from './riferimenti';

const riga = (pallet: string | null | undefined) => ({ pallet });

describe('valoriRiferimento', () => {
  it('deduplica e ignora vuoti e nulli', () => {
    expect(valoriRiferimento([riga('3'), riga('3'), riga(''), riga('  '), riga(null), riga(undefined)]))
      .toEqual(['3']);
  });

  it('tutti numerici → ordine da numeri (1, 2, 10 — non 1, 10, 2)', () => {
    expect(valoriRiferimento([riga('10'), riga('2'), riga('1')])).toEqual(['1', '2', '10']);
  });

  it('basta un valore non numerico e si ordina da testo, tutto insieme', () => {
    expect(valoriRiferimento([riga('PLT-2'), riga('10'), riga('PLT-1')]))
      .toEqual(['10', 'PLT-1', 'PLT-2']);
  });
});

describe('filtraPerRiferimento', () => {
  const righe = [riga('1'), riga('2'), riga(null), riga('')];

  it("'' non filtra: tutte le righe", () => {
    expect(filtraPerRiferimento(righe, '')).toHaveLength(4);
  });

  it('«Senza pallet» prende nulli e vuoti: è ciò che è ancora in cesta', () => {
    expect(filtraPerRiferimento(righe, SENZA_RIFERIMENTO)).toHaveLength(2);
  });

  it('un valore prende solo il suo pallet, tollerando gli spazi scritti a mano', () => {
    expect(filtraPerRiferimento([riga(' 1 '), riga('1'), riga('2')], '1')).toHaveLength(2);
  });
});

describe('il campo è un parametro: cesta e pallet non si confondono', () => {
  // Cesta 3 e pallet 7 sulla stessa riga è il caso normale a metà ciclo (scaricata in cesta,
  // già impallettata). Se il campo si confondesse, il filtro «cesta 3» pescherebbe per pallet
  // e l'ufficio impalletterebbe i contatori sbagliati.
  const righe = [
    { cesta: '3', pallet: '7' },
    { cesta: '4', pallet: '7' },
    { cesta: null, pallet: null },
  ];

  it('elenca i valori del campo chiesto', () => {
    expect(valoriRiferimento(righe, 'cesta')).toEqual(['3', '4']);
    expect(valoriRiferimento(righe, 'pallet')).toEqual(['7']);
  });

  it('filtra sul campo chiesto', () => {
    expect(filtraPerRiferimento(righe, '3', 'cesta')).toHaveLength(1);
    expect(filtraPerRiferimento(righe, '3', 'pallet')).toHaveLength(0);
    expect(filtraPerRiferimento(righe, '7', 'pallet')).toHaveLength(2);
  });

  it('«senza cesta» è la domanda «cosa è ancora in furgone?»', () => {
    expect(filtraPerRiferimento(righe, SENZA_RIFERIMENTO, 'cesta')).toHaveLength(1);
  });

  it('senza campo si resta sul pallet: i chiamanti storici non cambiano comportamento', () => {
    expect(valoriRiferimento(righe)).toEqual(['7']);
  });
});
