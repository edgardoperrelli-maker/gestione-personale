import { describe, it, expect } from 'vitest';
import { normMatricola, verdettoEsecuzione } from './verdettoEsecuzione';

describe('normMatricola', () => {
  it('maiuscolo, solo alfanumerici', () => {
    expect(normMatricola(' 2020-15.21 ab ')).toBe('20201521AB');
  });
  it('stringa vuota / nullish', () => {
    expect(normMatricola('')).toBe('');
    expect(normMatricola(undefined as unknown as string)).toBe('');
  });
});

describe('verdettoEsecuzione', () => {
  const M = '20000003994';

  it('intervento positivo per la matricola -> bloccato (fonte db)', () => {
    const v = verdettoEsecuzione(M, [{ odl: '912', matricola_contatore: M, data: '2026-06-29' }], []);
    expect(v).toEqual({ bloccato: true, fonte: 'db', odl: '912', data: '2026-06-29', esecutore: null });
  });

  it('voce di rapportino eseguito=SI per la matricola -> bloccato (fonte db)', () => {
    const v = verdettoEsecuzione(M, [], [{ odl: 'D1', matricola: M, eseguito: 'SI' }]);
    expect(v).toEqual({ bloccato: true, fonte: 'db', odl: 'D1', data: null, esecutore: null });
  });

  it('voce eseguito=NO (completato negativo) -> NON blocca', () => {
    expect(verdettoEsecuzione(M, [], [{ odl: 'D1', matricola: M, eseguito: 'NO' }]).bloccato).toBe(false);
  });

  it('voce "Nessun passaggio" nelle risposte non è SI -> NON blocca', () => {
    expect(verdettoEsecuzione(M, [], [{ matricola: M, eseguito: 'Nessun passaggio' }]).bloccato).toBe(false);
  });

  it('vince il positivo: intervento positivo + voce negativa -> bloccato', () => {
    const v = verdettoEsecuzione(M, [{ matricola_contatore: M, odl: '912' }], [{ matricola: M, eseguito: 'NO' }]);
    expect(v.bloccato).toBe(true);
    expect(v.fonte).toBe('db');
  });

  it('match per matricola NORMALIZZATA (trattini/spazi/case)', () => {
    const v = verdettoEsecuzione('2020-1521 ab', [{ matricola_contatore: ' 20201521AB ' }], []);
    expect(v.bloccato).toBe(true);
  });

  it('matricola diversa -> libero', () => {
    expect(verdettoEsecuzione(M, [{ matricola_contatore: '99999' }], [{ matricola: '99999', eseguito: 'SI' }]))
      .toEqual({ bloccato: false });
  });

  it('nessun esito a sistema -> libero', () => {
    expect(verdettoEsecuzione(M, [], [])).toEqual({ bloccato: false });
  });

  it('eseguito=si minuscolo -> bloccato (case-insensitive)', () => {
    expect(verdettoEsecuzione(M, [], [{ matricola: M, eseguito: 'si' }]).bloccato).toBe(true);
  });
});
