import { describe, it, expect } from 'vitest';
import { citaSeServe, incollaSuRighe, testoRighe } from './righeAppunti';
import { parseBloccoIncollato } from './editingGriglia';

const LIMITI = { righe: 10, colonne: 4 };

describe('citaSeServe', () => {
  it('lascia stare il testo normale', () => {
    expect(citaSeServe('CIARALLO')).toBe('CIARALLO');
    expect(citaSeServe('')).toBe('');
  });

  it('cita e raddoppia le virgolette quando la cella contiene tab, a capo o virgolette', () => {
    expect(citaSeServe('citofonare\ninterno 4')).toBe('"citofonare\ninterno 4"');
    expect(citaSeServe('a\tb')).toBe('"a\tb"');
    expect(citaSeServe('il "cancello"')).toBe('"il ""cancello"""');
  });
});

describe('testoRighe', () => {
  const valore = (r: number, c: string) => `r${r}-${c}`;

  it('esce in TSV, nell’ordine delle colonne a schermo, senza intestazione', () => {
    expect(testoRighe([1, 3], ['odl', 'note'], valore)).toBe('r1-odl\tr1-note\nr3-odl\tr3-note');
  });

  it('rispetta l’ordine in cui sono passate le righe, anche non contigue', () => {
    expect(testoRighe([5, 0], ['odl'], valore)).toBe('r5-odl\nr0-odl');
  });

  it('nessuna riga selezionata: stringa vuota, non una riga vuota', () => {
    expect(testoRighe([], ['odl'], valore)).toBe('');
  });

  it('quello che esce si rilegge: una nota con un a capo torna una cella sola', () => {
    const testo = testoRighe([0], ['a', 'b'], (_r, c) => (c === 'a' ? 'primo\nsecondo' : 'x'));
    expect(parseBloccoIncollato(testo)).toEqual([['primo\nsecondo', 'x']]);
  });
});

describe('incollaSuRighe', () => {
  it('una cella sola si ripete su tutte le righe spuntate — l’assegnazione senza la barra', () => {
    const e = incollaSuRighe([['CIARALLO']], [0, 4, 7], 1, LIMITI);
    expect(e.scritture).toEqual([
      { riga: 0, colonna: 1, valore: 'CIARALLO' },
      { riga: 4, colonna: 1, valore: 'CIARALLO' },
      { riga: 7, colonna: 1, valore: 'CIARALLO' },
    ]);
    expect(e.righeIgnorate).toBe(0);
    expect(e.righeNonCoperte).toBe(0);
  });

  it('una riga di più celle si ripete intera: esecutore e data in un colpo solo', () => {
    const e = incollaSuRighe([['CIARALLO', '31/07/2026']], [2, 3], 1, LIMITI);
    expect(e.scritture).toEqual([
      { riga: 2, colonna: 1, valore: 'CIARALLO' },
      { riga: 2, colonna: 2, valore: '31/07/2026' },
      { riga: 3, colonna: 1, valore: 'CIARALLO' },
      { riga: 3, colonna: 2, valore: '31/07/2026' },
    ]);
  });

  it('più righe vanno riga per riga sulle spuntate, nell’ordine dato', () => {
    const e = incollaSuRighe([['A'], ['B'], ['C']], [1, 5, 6], 0, LIMITI);
    expect(e.scritture).toEqual([
      { riga: 1, colonna: 0, valore: 'A' },
      { riga: 5, colonna: 0, valore: 'B' },
      { riga: 6, colonna: 0, valore: 'C' },
    ]);
  });

  it('le righe spuntate non contigue restano quelle: non si riempie il buco in mezzo', () => {
    const e = incollaSuRighe([['A'], ['B']], [0, 9], 0, LIMITI);
    expect(e.scritture.map((s) => s.riga)).toEqual([0, 9]);
  });

  it('blocco più lungo della selezione: si tronca e lo si conta', () => {
    const e = incollaSuRighe([['A'], ['B'], ['C']], [0, 1], 0, LIMITI);
    expect(e.scritture).toHaveLength(2);
    expect(e.righeIgnorate).toBe(1);
    expect(e.righeNonCoperte).toBe(0);
  });

  it('blocco più corto della selezione: le righe scoperte restano intatte e si contano', () => {
    const e = incollaSuRighe([['A'], ['B']], [0, 1, 2, 3], 0, LIMITI);
    expect(e.scritture).toHaveLength(2);
    expect(e.righeNonCoperte).toBe(2);
    expect(e.righeIgnorate).toBe(0);
  });

  it('ciò che sfonda il bordo destro si conta UNA volta sola, non una per riga', () => {
    const e = incollaSuRighe([['a', 'b', 'c']], [0, 1, 2], 3, LIMITI);
    expect(e.colonneIgnorate).toBe(2);
    expect(e.scritture).toEqual([
      { riga: 0, colonna: 3, valore: 'a' },
      { riga: 1, colonna: 3, valore: 'a' },
      { riga: 2, colonna: 3, valore: 'a' },
    ]);
  });

  it('scarta le righe spuntate che non esistono più (tabella ricaricata più corta)', () => {
    const e = incollaSuRighe([['A']], [0, 42], 0, { righe: 3, colonne: 2 });
    expect(e.scritture).toEqual([{ riga: 0, colonna: 0, valore: 'A' }]);
  });

  it('senza righe spuntate, senza blocco o su tabella vuota non scrive niente', () => {
    expect(incollaSuRighe([['A']], [], 0, LIMITI).scritture).toEqual([]);
    expect(incollaSuRighe([], [0], 0, LIMITI).scritture).toEqual([]);
    expect(incollaSuRighe([['A']], [0], 0, { righe: 0, colonne: 0 }).scritture).toEqual([]);
  });
});
