import { describe, it, expect } from 'vitest';
import {
  LARGHEZZA_MAX, LARGHEZZA_MIN, LAYOUT_VUOTO,
  chiaveLayout, leggiLayout, limitaLarghezza, ordinaColonne, spostaColonna, spostaDi,
} from './layoutTabella';

const col = (...chiavi: string[]) => chiavi.map((chiave) => ({ chiave }));
const chiavi = (c: Array<{ chiave: string }>) => c.map((x) => x.chiave);
const VALIDE = new Set(['odl', 'comune', 'cap', 'stato']);

describe('ordinaColonne', () => {
  it('senza ordine salvato lascia la definizione com’è', () => {
    const c = col('odl', 'comune', 'cap');
    expect(ordinaColonne(c, [])).toBe(c); // stessa identità: nessuna copia inutile
  });

  it('applica l’ordine scelto', () => {
    expect(chiavi(ordinaColonne(col('odl', 'comune', 'cap'), ['cap', 'odl', 'comune'])))
      .toEqual(['cap', 'odl', 'comune']);
  });

  // Il caso che conta davvero: si aggiunge una colonna al codice, e in giro ci sono layout salvati
  // che non la conoscono. Se l'ordine salvato facesse da elenco autorevole, quella colonna
  // sparirebbe per tutti quegli utenti — senza errori, e senza che nessuno colleghi la cosa.
  it('una colonna nuova entra accanto a dove sta di default, non in fondo', () => {
    const dopo = ordinaColonne(col('odl', 'comune', 'cap', 'stato'), ['odl', 'comune', 'stato']);
    // `cap` è nuova: sta dopo `comune` nella definizione, e lì resta.
    expect(chiavi(dopo)).toEqual(['odl', 'comune', 'cap', 'stato']);
  });

  it('una colonna nuova in testa resta in testa', () => {
    const dopo = ordinaColonne(col('nuova', 'odl', 'comune'), ['comune', 'odl']);
    expect(chiavi(dopo)).toEqual(['nuova', 'comune', 'odl']);
  });

  it('non perde nessuna colonna, comunque sia messo l’ordine salvato', () => {
    const c = col('odl', 'comune', 'cap', 'stato');
    for (const ordine of [[], ['cap'], ['stato', 'odl'], ['zzz', 'cap'], ['cap', 'cap', 'odl']]) {
      expect(chiavi(ordinaColonne(c, ordine)).sort()).toEqual(['cap', 'comune', 'odl', 'stato']);
    }
  });

  it('ignora le chiavi che non esistono più', () => {
    expect(chiavi(ordinaColonne(col('odl', 'comune'), ['sparita', 'comune', 'odl'])))
      .toEqual(['comune', 'odl']);
  });
});

describe('spostaColonna', () => {
  it('porta la colonna nella posizione di quella di arrivo', () => {
    expect(spostaColonna(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(spostaColonna(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('su sé stessa o su chiavi ignote non fa niente', () => {
    expect(spostaColonna(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
    expect(spostaColonna(['a', 'b'], 'z', 'a')).toEqual(['a', 'b']);
    expect(spostaColonna(['a', 'b'], 'a', 'z')).toEqual(['a', 'b']);
  });

  it('non muta l’array ricevuto', () => {
    const o = ['a', 'b', 'c'];
    spostaColonna(o, 'c', 'a');
    expect(o).toEqual(['a', 'b', 'c']);
  });
});

describe('spostaDi', () => {
  it('sposta di un posto', () => {
    expect(spostaDi(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(spostaDi(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('ai bordi non fa niente invece di far uscire la colonna', () => {
    expect(spostaDi(['a', 'b'], 'a', -1)).toEqual(['a', 'b']);
    expect(spostaDi(['a', 'b'], 'b', 1)).toEqual(['a', 'b']);
  });
});

describe('limitaLarghezza', () => {
  it('tiene la colonna leggibile e dentro lo schermo', () => {
    expect(limitaLarghezza(10)).toBe(LARGHEZZA_MIN);
    expect(limitaLarghezza(9999)).toBe(LARGHEZZA_MAX);
    expect(limitaLarghezza(123.4)).toBe(123);
  });

  it('un valore non numerico non produce NaN nello stile', () => {
    expect(limitaLarghezza(Number.NaN)).toBe(LARGHEZZA_MIN);
    expect(limitaLarghezza(Number.POSITIVE_INFINITY)).toBe(LARGHEZZA_MIN);
  });
});

describe('leggiLayout', () => {
  it('legge un layout valido', () => {
    const l = leggiLayout('{"ordine":["cap","odl"],"larghezze":{"cap":90}}', VALIDE);
    expect(l).toEqual({ ordine: ['cap', 'odl'], larghezze: { cap: 90 } });
  });

  // La stringa vive nel browser dell'utente e sopravvive ai rilasci: può essere qualunque cosa.
  // L'alternativa allo scarto silenzioso è una tabella che non si disegna.
  it.each([
    ['assente', null],
    ['JSON rotto', '{ordine:'],
    ['non un oggetto', '"ciao"'],
    ['null', 'null'],
    ['campi del tipo sbagliato', '{"ordine":"cap","larghezze":[1,2]}'],
  ])('su input %s torna il layout vuoto', (_caso, grezzo) => {
    expect(leggiLayout(grezzo, VALIDE)).toEqual(LAYOUT_VUOTO);
  });

  it('scarta le chiavi che non esistono più e i doppioni', () => {
    const l = leggiLayout('{"ordine":["sparita","cap","cap","odl"],"larghezze":{"sparita":80}}', VALIDE);
    expect(l.ordine).toEqual(['cap', 'odl']);
    expect(l.larghezze).toEqual({});
  });

  it('riporta in scala le larghezze assurde invece di scartare tutto', () => {
    const l = leggiLayout('{"larghezze":{"cap":5,"odl":99999,"stato":"grande"}}', VALIDE);
    expect(l.larghezze).toEqual({ cap: LARGHEZZA_MIN, odl: LARGHEZZA_MAX });
  });
});

describe('chiaveLayout', () => {
  it('le due viste non si sovrascrivono il layout', () => {
    expect(chiaveLayout('dunning')).not.toBe(chiaveLayout('massive'));
  });
});
