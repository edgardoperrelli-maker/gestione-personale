import { describe, it, expect } from 'vitest';
import { inAttesa, novitaAssegnazione } from './attesaAssegnazione';

describe('inAttesa', () => {
  it('solo le voci sospese: sono quelle per cui vale la pena continuare a chiedere', () => {
    const v = [
      { id: 'a', approvazione_stato: 'in_attesa' },
      { id: 'b', approvazione_stato: 'approvato' },
      { id: 'c', approvazione_stato: null },
      { id: 'd' },
    ];
    expect(inAttesa(v).map((x) => x.id)).toEqual(['a']);
  });

  it('nessuna sospesa → si smette di chiedere', () => {
    expect(inAttesa([{ id: 'a', approvazione_stato: 'approvato' }])).toEqual([]);
    expect(inAttesa([])).toEqual([]);
  });
});

describe('novitaAssegnazione', () => {
  const sospesa = [{ id: 'v1', approvazione_stato: 'in_attesa' }];

  it('sospesa → approvata: l’operatore può iniziare', () => {
    expect(novitaAssegnazione(sospesa, [{ id: 'v1', approvazione_stato: 'approvato' }]))
      .toEqual({ tipo: 'assegnate', ids: ['v1'] });
  });

  it('sospesa → rifiutata: va detto, ma non è un via libera', () => {
    expect(novitaAssegnazione(sospesa, [{ id: 'v1', approvazione_stato: 'rifiutato' }]))
      .toEqual({ tipo: 'rifiutate', ids: ['v1'] });
  });

  it('ancora sospesa → non si disturba chi sta aspettando', () => {
    expect(novitaAssegnazione(sospesa, [{ id: 'v1', approvazione_stato: 'in_attesa' }]))
      .toEqual({ tipo: 'nessuna' });
  });

  it('le approvazioni battono i rifiuti nello stesso giro', () => {
    // Chi è fermo davanti a un contatore ha bisogno della notizia che lo sblocca.
    const due = [
      { id: 'v1', approvazione_stato: 'in_attesa' },
      { id: 'v2', approvazione_stato: 'in_attesa' },
    ];
    expect(novitaAssegnazione(due, [
      { id: 'v1', approvazione_stato: 'rifiutato' },
      { id: 'v2', approvazione_stato: 'approvato' },
    ])).toEqual({ tipo: 'assegnate', ids: ['v2'] });
  });

  it('voci già approvate prima non rigenerano la notizia a ogni giro', () => {
    const gia = [{ id: 'v1', approvazione_stato: 'approvato' }];
    expect(novitaAssegnazione(gia, [{ id: 'v1', approvazione_stato: 'approvato' }]))
      .toEqual({ tipo: 'nessuna' });
  });

  it('voce nuova che il tablet non aveva → nessun annuncio (non era in attesa qui)', () => {
    expect(novitaAssegnazione([], [{ id: 'nuova', approvazione_stato: 'approvato' }]))
      .toEqual({ tipo: 'nessuna' });
  });

  it('voce sparita lato server → nessuna novità da annunciare', () => {
    expect(novitaAssegnazione(sospesa, [])).toEqual({ tipo: 'nessuna' });
  });
});
