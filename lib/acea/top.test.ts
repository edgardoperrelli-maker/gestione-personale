import { describe, expect, it } from 'vitest';
import { odlTop, ordinaTopPrima } from './top';

describe('odlTop', () => {
  it('prende solo gli ODL marcati', () => {
    const set = odlTop([
      { odl: '111', top: true },
      { odl: '222', top: false },
      { odl: '333', top: null },
    ]);
    expect([...set]).toEqual(['111']);
  });

  it('basta UNA riga TOP: un ODL può avere più operazioni', () => {
    // La chiave del registro è (odl, numero_operazione), ma l'operatore ha in mano il solo ODL.
    // Se marcarne una non bastasse, l'ufficio dovrebbe sapere quale operazione scegliere.
    const set = odlTop([
      { odl: '444', top: false },
      { odl: '444', top: true },
    ]);
    expect(set.has('444')).toBe(true);
  });

  it('ignora gli ODL vuoti e normalizza spazi e maiuscole', () => {
    const set = odlTop([
      { odl: null, top: true },
      { odl: '  ', top: true },
      { odl: ' 555 ', top: true },
    ]);
    expect([...set]).toEqual(['555']);
  });
});

describe('ordinaTopPrima', () => {
  it('i TOP salgono in cima', () => {
    const righe = [
      { id: 'a', top: false },
      { id: 'b', top: true },
      { id: 'c', top: false },
    ];
    expect(ordinaTopPrima(righe).map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it("è STABILE: dentro ogni gruppo resta l'ordine del giro", () => {
    // L'ordine di partenza è quello geografico con cui l'operatore si muove: rimescolarlo
    // dentro il gruppo TOP gli farebbe fare chilometri in più per obbedire al badge.
    const righe = [
      { id: 'a', top: true },
      { id: 'b', top: false },
      { id: 'c', top: true },
      { id: 'd', top: false },
    ];
    expect(ordinaTopPrima(righe).map((r) => r.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('senza TOP non cambia niente, e non muta la lista in ingresso', () => {
    // Tipata a mano: con un literal senza `top` TypeScript inferisce il generico dal vincolo
    // invece che dalla riga, e perde `id`.
    const righe: { id: string; top?: boolean }[] = [{ id: 'a' }, { id: 'b' }];
    const fuori = ordinaTopPrima(righe);
    expect(fuori.map((r) => r.id)).toEqual(['a', 'b']);
    expect(fuori).not.toBe(righe);
  });
});
