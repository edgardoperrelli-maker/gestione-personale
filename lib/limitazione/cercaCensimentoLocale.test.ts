import { describe, it, expect } from 'vitest';
import { cercaCensimentoLocale } from './cercaCensimentoLocale';
import type { CensitoMisuratore } from './autofillAnagrafica';

const righe: CensitoMisuratore[] = [
  { matricola: '99A023041', indirizzo: 'Via Roma', civico: '1', comune: 'Roma' },
  { matricola: 'B12345678', nominativo: 'Rossi' },
];

describe('cercaCensimentoLocale', () => {
  it('match esatto → trovato', () => {
    expect(cercaCensimentoLocale('99A023041', righe)).toEqual({ trovato: true, misuratore: righe[0] });
  });
  it('niente esatto → simili (prefisso variabile: A023041 trova 99A023041)', () => {
    const r = cercaCensimentoLocale('A023041', righe);
    expect(r.trovato).toBe(false);
    if (!r.trovato) expect(r.suggerimenti.map((s) => s.matricola)).toContain('99A023041');
  });
  it('q vuota → nessun risultato', () => {
    expect(cercaCensimentoLocale('  ', righe)).toEqual({ trovato: false, suggerimenti: [] });
  });
  it('nessun simile → suggerimenti vuoti', () => {
    expect(cercaCensimentoLocale('ZZZZZZ', righe)).toEqual({ trovato: false, suggerimenti: [] });
  });
});
