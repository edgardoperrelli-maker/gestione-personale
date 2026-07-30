import { describe, it, expect } from 'vitest';
import { haNovita, idDecisi, inAttesa, novitaAssegnazione } from './attesaAssegnazione';

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
});

describe('idDecisi', () => {
  it('approvate e rifiutate sono decise; sospese e non-manuali no', () => {
    const s = idDecisi([
      { id: 'ok', approvazione_stato: 'approvato' },
      { id: 'ko', approvazione_stato: 'rifiutato' },
      { id: 'att', approvazione_stato: 'in_attesa' },
      { id: 'std', approvazione_stato: null },
    ]);
    expect([...s].sort()).toEqual(['ko', 'ok']);
  });
});

describe('novitaAssegnazione', () => {
  it('una voce approvata mai annunciata prima → novità', () => {
    const n = novitaAssegnazione(new Set(), [{ id: 'v1', approvazione_stato: 'approvato' }]);
    expect(n.assegnate).toEqual(['v1']);
    expect(haNovita(n)).toBe(true);
  });

  it('già annunciata → non si ripete a ogni giro', () => {
    const n = novitaAssegnazione(new Set(['v1']), [{ id: 'v1', approvazione_stato: 'approvato' }]);
    expect(haNovita(n)).toBe(false);
  });

  it('ancora sospesa → nessuna notizia, ma si conta per chi aspetta', () => {
    const n = novitaAssegnazione(new Set(), [{ id: 'v1', approvazione_stato: 'in_attesa' }]);
    expect(haNovita(n)).toBe(false);
    expect(n.ancoraInAttesa).toBe(1);
  });

  // Il caso che la versione precedente sbagliava: l'operatore manda piu' richieste DOPO che la
  // pagina e' stata caricata. Confrontando con lo stato iniziale non sarebbero mai emerse.
  it('richieste create dopo il caricamento vengono comunque annunciate', () => {
    const noti = new Set<string>(); // la pagina non conosceva nessuna di queste voci
    const n = novitaAssegnazione(noti, [
      { id: 'nuova1', approvazione_stato: 'approvato' },
      { id: 'nuova2', approvazione_stato: 'approvato' },
      { id: 'nuova3', approvazione_stato: 'in_attesa' },
    ]);
    expect(n.assegnate.sort()).toEqual(['nuova1', 'nuova2']);
    expect(n.ancoraInAttesa).toBe(1);
  });

  it('più richieste insieme: si annunciano tutte in un colpo', () => {
    const n = novitaAssegnazione(new Set(), [
      { id: 'a', approvazione_stato: 'approvato' },
      { id: 'b', approvazione_stato: 'approvato' },
      { id: 'c', approvazione_stato: 'approvato' },
    ]);
    expect(n.assegnate).toHaveLength(3);
  });

  it('approvate e rifiutate nello stesso giro convivono: sono notizie diverse', () => {
    const n = novitaAssegnazione(new Set(), [
      { id: 'ok', approvazione_stato: 'approvato' },
      { id: 'ko', approvazione_stato: 'rifiutato' },
    ]);
    expect(n.assegnate).toEqual(['ok']);
    expect(n.rifiutate).toEqual(['ko']);
  });

  it('le voci normali del rapportino non sono novità', () => {
    const n = novitaAssegnazione(new Set(), [{ id: 'std', approvazione_stato: null }, { id: 'x' }]);
    expect(haNovita(n)).toBe(false);
    expect(n.ancoraInAttesa).toBe(0);
  });
});
