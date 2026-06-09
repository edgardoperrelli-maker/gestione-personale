import { describe, it, expect } from 'vitest';
import { voceEsitoColore } from './voceColore';
import type { TemplateCampo } from './buildVoci';

const standard: TemplateCampo[] = [
  { chiave: 'att_cess', etichetta: 'ATT/CESS', tipo: 'crocetta', ordine: 1 },
  { chiave: 'assente', etichetta: 'ASSENTE', tipo: 'crocetta', ordine: 2 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 3 },
];
const eseguito: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
];

describe('voceEsitoColore', () => {
  it('crocetta ASSENTE → rossa', () => { expect(voceEsitoColore({ assente: true }, standard)).toBe('rossa'); });
  it('crocetta positiva → verde', () => { expect(voceEsitoColore({ att_cess: true }, standard)).toBe('verde'); });
  it('ASSENTE ha priorità sul positivo', () => { expect(voceEsitoColore({ att_cess: true, assente: true }, standard)).toBe('rossa'); });
  it('select NO → rossa, SI → verde', () => {
    expect(voceEsitoColore({ eseguito: 'NO' }, eseguito)).toBe('rossa');
    expect(voceEsitoColore({ eseguito: 'SI' }, eseguito)).toBe('verde');
  });
  it('solo note o vuoto → neutro', () => {
    expect(voceEsitoColore({ note: 'x' }, standard)).toBe('neutro');
    expect(voceEsitoColore({}, standard)).toBe('neutro');
  });
});

describe('voceEsitoColore — campi esito a tendina (Eseguito / Assente / Non eseguito)', () => {
  const campi: TemplateCampo[] = [
    { chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 },
    { chiave: 'assente', etichetta: 'ASSENTE', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 2 },
    { chiave: 'non_eseguito', etichetta: 'NON ESEGUITO', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 3 },
  ];
  it('Eseguito = SI → verde', () => { expect(voceEsitoColore({ eseguito: 'SI' }, campi)).toBe('verde'); });
  it('Assente = SI (tendina) → rossa', () => { expect(voceEsitoColore({ assente: 'SI' }, campi)).toBe('rossa'); });
  it('Non eseguito = SI (tendina) → rossa', () => { expect(voceEsitoColore({ non_eseguito: 'SI' }, campi)).toBe('rossa'); });
  it('Eseguito = NO → rossa', () => { expect(voceEsitoColore({ eseguito: 'NO' }, campi)).toBe('rossa'); });
  it('Non eseguito spuntato (crocetta) → rossa', () => {
    expect(voceEsitoColore({ ne: true }, [{ chiave: 'ne', etichetta: 'Non eseguito', tipo: 'crocetta', ordine: 1 }])).toBe('rossa');
  });
});
