import { describe, it, expect } from 'vitest';
import { selezionaRighe, type SelezioneRighe } from './selezioneRighe';

const IDS = ['a', 'b', 'c', 'd', 'e'];
const scelte = (s: SelezioneRighe) => Object.keys(s).filter((k) => s[k]).sort();

describe('selezionaRighe — click semplice', () => {
  it('accende la riga e ci pianta l’ancora', () => {
    const r = selezionaRighe({}, IDS, 2, false, null);
    expect(scelte(r.selezione)).toEqual(['c']);
    expect(r.ancora).toBe(2);
  });

  it('rispegne una riga già accesa', () => {
    const r = selezionaRighe({ c: true }, IDS, 2, false, null);
    expect(scelte(r.selezione)).toEqual([]);
  });

  it('non tocca le altre righe già scelte', () => {
    const r = selezionaRighe({ a: true }, IDS, 2, false, null);
    expect(scelte(r.selezione)).toEqual(['a', 'c']);
  });

  // Spegnendo si CANCELLA la chiave invece di metterla a `false`: TanStack conta le chiavi
  // presenti, quindi un `false` lasciato lì terrebbe la riga nel conteggio della selezione.
  it('spegnendo toglie la chiave, non la mette a false', () => {
    const r = selezionaRighe({ c: true }, IDS, 2, false, null);
    expect('c' in r.selezione).toBe(false);
  });
});

describe('selezionaRighe — shift-click', () => {
  it('accende tutto l’intervallo fra l’ancora e la riga cliccata', () => {
    const r = selezionaRighe({ b: true }, IDS, 4, true, 1);
    expect(scelte(r.selezione)).toEqual(['b', 'c', 'd', 'e']);
  });

  it('funziona anche all’indietro', () => {
    const r = selezionaRighe({}, IDS, 0, true, 3);
    expect(scelte(r.selezione)).toEqual(['a', 'b', 'c', 'd']);
  });

  // Si può allargare l'intervallo con piu` shift-click di fila: e` il modo in cui lo si usa
  // davvero, e spostare l'ancora a ogni colpo lo renderebbe impossibile.
  it('lascia l’ancora dov’e`, cosi` l’intervallo si puo` allargare', () => {
    const primo = selezionaRighe({}, IDS, 2, true, 0);
    expect(primo.ancora).toBe(0);
    const secondo = selezionaRighe(primo.selezione, IDS, 4, true, primo.ancora);
    expect(scelte(secondo.selezione)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('non spegne quello che era gia` scelto fuori dall’intervallo', () => {
    const r = selezionaRighe({ e: true }, IDS, 1, true, 0);
    expect(scelte(r.selezione)).toEqual(['a', 'b', 'e']);
  });

  it('senza ancora vale come un click semplice', () => {
    // Un intervallo con un solo estremo non esiste: meglio selezionare la riga cliccata che non
    // fare niente, che sembrerebbe un click perso.
    const r = selezionaRighe({}, IDS, 3, true, null);
    expect(scelte(r.selezione)).toEqual(['d']);
    expect(r.ancora).toBe(3);
  });

  it('l’intervallo di una riga sola e` la riga stessa', () => {
    const r = selezionaRighe({}, IDS, 2, true, 2);
    expect(scelte(r.selezione)).toEqual(['c']);
  });
});

/*
  IL BACO CHE QUESTI TEST PRESIDIANO.

  Il checkbox aveva due gestori — `onChange` per il toggle, `onClick` per l'intervallo — e React
  ricava l'evento `change` di un checkbox dal click stesso: su uno shift-click partivano entrambi.
  Entrambi ricostruivano la selezione da `{ ...selezione }` letto dalla stessa closure di render,
  quindi la seconda chiamata sovrascriveva l'intervallo appena scelto e restava il solo toggle.

  A schermo sembrava che lo shift-click non facesse nulla di speciale. Nessun errore, nessun
  avviso: solo venti caselle da spuntare a mano.
*/
describe('un gesto, un percorso', () => {
  it('due chiamate sulla stessa selezione di partenza si sovrascrivono', () => {
    // La dimostrazione del difetto: partendo entrambe dallo stato di render, la seconda vince e
    // l'intervallo sparisce. È il motivo per cui il componente ora chiama la regola UNA volta.
    const partenza: SelezioneRighe = { a: true };
    const intervallo = selezionaRighe(partenza, IDS, 3, true, 0);
    const toggle = selezionaRighe(partenza, IDS, 3, false, 0);

    expect(scelte(intervallo.selezione)).toEqual(['a', 'b', 'c', 'd']);
    expect(scelte(toggle.selezione)).toEqual(['a', 'd']);
    // Applicandole in sequenza a partire dallo stesso stato, dell'intervallo non resta niente.
    expect(scelte(toggle.selezione)).not.toEqual(scelte(intervallo.selezione));
  });
});

describe('indici fuori elenco', () => {
  // Una chiave `undefined` nella selezione gonfierebbe il contatore delle righe scelte con una
  // riga che non esiste.
  it('non inventano righe', () => {
    expect(selezionaRighe({}, IDS, 9, false, null).selezione).toEqual({});
    expect(selezionaRighe({}, IDS, -1, false, null).selezione).toEqual({});
    expect(selezionaRighe({}, [], 0, false, null).selezione).toEqual({});
  });

  it('un’ancora non piu` valida degrada a click semplice', () => {
    // Succede dopo un filtro: l'ancora puntava a una riga che ora non c'e` piu`.
    const r = selezionaRighe({}, IDS, 1, true, 99);
    expect(scelte(r.selezione)).toEqual(['b']);
  });
});
