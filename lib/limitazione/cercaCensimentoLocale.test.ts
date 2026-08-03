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
    if (!r.trovato) {
      expect(r.suggerimenti.map((s) => s.matricola)).toContain('99A023041');
      expect(r.ambigui).toBe(false);
    }
  });
  it('q vuota → nessun risultato', () => {
    expect(cercaCensimentoLocale('  ', righe)).toEqual({ trovato: false, ambigui: false, suggerimenti: [] });
  });
  it('nessun simile → suggerimenti vuoti', () => {
    expect(cercaCensimentoLocale('ZZZZZZ', righe)).toEqual({ trovato: false, ambigui: false, suggerimenti: [] });
  });

  // Il caso RIANO: l'export ACEA tronca le matricole lunghe, quindi più ordini finiscono nella
  // cache con la STESSA matricola a indirizzi diversi. Compilare col primo scriverebbe un ODL a
  // caso su un lavoro fatto: si mostra la scelta.
  it('più esatti (troncone condiviso) → non trovato, ambiguo, tutti i candidati', () => {
    const tronconi: CensitoMisuratore[] = [
      { matricola: 'SETA07122500517', indirizzo: 'VIA DEL CAVONE', civico: '51', odl: '912490311' },
      { matricola: 'SETA07122500517', indirizzo: 'VIA DEL CAVONE', civico: '39', odl: '912489803' },
    ];
    const r = cercaCensimentoLocale('SETA07122500517', tronconi);
    expect(r.trovato).toBe(false);
    if (!r.trovato) {
      expect(r.ambigui).toBe(true);
      expect(r.suggerimenti.map((s) => s.odl)).toEqual(['912490311', '912489803']);
    }
  });
});
