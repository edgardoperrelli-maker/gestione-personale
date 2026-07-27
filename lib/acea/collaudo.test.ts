import { describe, it, expect } from 'vitest';
import { confrontaOdl, semaforo, type OdlStato } from './collaudo';

const o = (odl: string, aperto: boolean): OdlStato => ({ odl, aperto });

describe('confrontaOdl', () => {
  it('due fonti identiche concordano su tutto', () => {
    const righe = [o('900', true), o('901', false)];
    const c = confrontaOdl(righe, righe);
    expect(c).toMatchObject({
      moduloTotale: 2, altraTotale: 2, inEntrambi: 2, concordi: 2,
    });
    expect(c.soloModulo.totale).toBe(0);
    expect(c.soloAltra.totale).toBe(0);
    expect(c.statoDiverso.totale).toBe(0);
    expect(semaforo(c)).toBe('verde');
  });

  it('separa chi manca da una parte e chi dall altra', () => {
    const c = confrontaOdl([o('900', true), o('901', true)], [o('901', true), o('902', true)]);
    expect(c.soloModulo).toEqual({ totale: 1, esempi: ['900'] });
    expect(c.soloAltra).toEqual({ totale: 1, esempi: ['902'] });
    expect(c.inEntrambi).toBe(1);
  });

  it('un ODL che la fonte ha e il modulo no è rosso: sarebbe lavoro invisibile', () => {
    const c = confrontaOdl([], [o('900', true)]);
    expect(semaforo(c)).toBe('rosso');
  });

  it('un ODL in più nel modulo è giallo: di solito è la finestra dell import più larga', () => {
    const c = confrontaOdl([o('900', true)], []);
    expect(semaforo(c)).toBe('giallo');
  });

  it('lo stato discorde è rosso e dice da che parte sta la differenza', () => {
    const c = confrontaOdl([o('900', true)], [o('900', false)]);
    expect(c.statoDiverso).toEqual({
      totale: 1, esempi: [{ odl: '900', modulo: 'aperto', altra: 'chiuso' }],
    });
    expect(c.concordi).toBe(0);
    expect(semaforo(c)).toBe('rosso');
  });

  it('un ODL con più operazioni è aperto se lo è almeno una', () => {
    // È il criterio con cui il backlog lo mostra: basta un pezzo da fare.
    const c = confrontaOdl([o('900', false), o('900', true)], [o('900', true)]);
    expect(c.moduloTotale).toBe(1);
    expect(c.concordi).toBe(1);
  });

  it('confronta gli ODL senza badare a spazi e maiuscole', () => {
    const c = confrontaOdl([o(' 900 ', true)], [o('900', true)]);
    expect(c.inEntrambi).toBe(1);
    expect(c.soloModulo.totale).toBe(0);
  });

  it('scarta gli ODL vuoti invece di contarli come una differenza', () => {
    const c = confrontaOdl([o('', true), o('900', true)], [o('  ', false), o('900', true)]);
    expect(c.moduloTotale).toBe(1);
    expect(c.altraTotale).toBe(1);
    expect(c.concordi).toBe(1);
  });

  it('tronca gli esempi ma NON i totali: uno scarto grosso resta leggibile e onesto', () => {
    const modulo = Array.from({ length: 50 }, (_, i) => o(`9${i}`, true));
    const c = confrontaOdl(modulo, [], { maxEsempi: 5 });
    expect(c.soloModulo.totale).toBe(50);
    expect(c.soloModulo.esempi).toHaveLength(5);
  });

  it('due fonti vuote non sono un errore', () => {
    const c = confrontaOdl([], []);
    expect(c).toMatchObject({ moduloTotale: 0, altraTotale: 0, inEntrambi: 0, concordi: 0 });
    expect(semaforo(c)).toBe('verde');
  });
});
