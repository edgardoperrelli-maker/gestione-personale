import { describe, it, expect } from 'vitest';
import { statoPresaInCarico } from './etichettaPresaInCarico';

const nomi = { u1: 'Anna', u2: 'Marco' };

describe('statoPresaInCarico', () => {
  it('libera → nessuna etichetta, mostra Prendi', () => {
    expect(statoPresaInCarico(null, 'u1', nomi)).toEqual({
      etichetta: null, miaPresa: false, presaDaAltro: false,
      mostraPrendi: true, mostraRilascia: false, mostraOverride: false,
    });
  });
  it('presa da me → "in gestione (tu)", mostra Rilascia', () => {
    const s = statoPresaInCarico('u1', 'u1', nomi);
    expect(s.etichetta).toBe('In gestione: tu');
    expect(s.miaPresa).toBe(true);
    expect(s.mostraRilascia).toBe(true);
    expect(s.mostraPrendi).toBe(false);
    expect(s.mostraOverride).toBe(false);
  });
  it('presa da altro → "in gestione: <nome>", mostra Override', () => {
    const s = statoPresaInCarico('u2', 'u1', nomi);
    expect(s.etichetta).toBe('In gestione: Marco');
    expect(s.presaDaAltro).toBe(true);
    expect(s.mostraOverride).toBe(true);
    expect(s.mostraPrendi).toBe(false);
    expect(s.mostraRilascia).toBe(false);
  });
  it('presa da altro sconosciuto (uuid non in mappa) → fallback "un altro operatore"', () => {
    const s = statoPresaInCarico('u9', 'u1', nomi);
    expect(s.etichetta).toBe('In gestione: un altro operatore');
    expect(s.presaDaAltro).toBe(true);
  });
});
