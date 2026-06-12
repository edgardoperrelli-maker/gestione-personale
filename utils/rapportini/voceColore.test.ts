import { describe, it, expect } from 'vitest';
import { voceEsitoColore, haEsitoNegativo } from './voceColore';
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
  // Esito negativo SENZA note → neutro (note obbligatorie con esito negativo)
  it('crocetta ASSENTE senza note → neutro (note obbligatorie)', () => {
    expect(voceEsitoColore({ assente: true }, standard)).toBe('neutro');
  });
  // Esito negativo CON note → rossa
  it('crocetta ASSENTE + note compilate → rossa', () => {
    expect(voceEsitoColore({ assente: true, note: 'cliente non trovato' }, standard)).toBe('rossa');
  });
  // Esito positivo → verde, le note non contano
  it('crocetta positiva senza note → verde (note facoltative)', () => {
    expect(voceEsitoColore({ att_cess: true }, standard)).toBe('verde');
  });
  it('crocetta positiva con note → verde', () => {
    expect(voceEsitoColore({ att_cess: true, note: 'ok' }, standard)).toBe('verde');
  });
  // Esito negativo ha priorità sul positivo
  it('ASSENTE ha priorità sul positivo, ma senza note → neutro', () => {
    expect(voceEsitoColore({ att_cess: true, assente: true }, standard)).toBe('neutro');
  });
  it('ASSENTE ha priorità sul positivo, con note → rossa', () => {
    expect(voceEsitoColore({ att_cess: true, assente: true, note: 'assente al campanello' }, standard)).toBe('rossa');
  });
  it('select NO → rossa (template senza note), SI → verde', () => {
    // Template senza campi note → noteCompilate() = true → esito negativo accettato
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

describe('haEsitoNegativo', () => {
  const campi: TemplateCampo[] = [
    { chiave: 'assente', etichetta: 'Assente', tipo: 'crocetta', ordine: 1 },
    { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'crocetta', ordine: 2 },
    { chiave: 'esito', etichetta: 'Esito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 3 },
  ];
  it('crocetta negativa spuntata → true', () => {
    expect(haEsitoNegativo({ assente: true }, campi)).toBe(true);
  });
  it('select su NO → true', () => {
    expect(haEsitoNegativo({ esito: 'NO' }, campi)).toBe(true);
  });
  it('solo positivi → false', () => {
    expect(haEsitoNegativo({ eseguito: true, esito: 'SI' }, campi)).toBe(false);
  });
  it('niente compilato → false', () => {
    expect(haEsitoNegativo({}, campi)).toBe(false);
  });
});
