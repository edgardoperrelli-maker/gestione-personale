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
  it('master esito positivo -> bloccato (fonte master)', () => {
    const v = verdettoEsecuzione({ statoMaster: { esito: 'positivo', odl: '912', esecutore: 'ROSSI' } });
    expect(v).toEqual({ bloccato: true, fonte: 'master', odl: '912', data: null, esecutore: 'ROSSI' });
  });
  it('master stato COMPLETATO -> bloccato', () => {
    expect(verdettoEsecuzione({ statoMaster: { stato_odl: 'COMPLETATO' } }).bloccato).toBe(true);
  });
  it('voce positiva nel db -> bloccato (fonte db)', () => {
    expect(verdettoEsecuzione({ vocePositivaDb: { odl: '912', data: '2026-06-30' } }))
      .toEqual({ bloccato: true, fonte: 'db', odl: '912', data: '2026-06-30', esecutore: null });
  });
  it('master negativo e nessuna voce -> libero', () => {
    expect(verdettoEsecuzione({ statoMaster: { esito: 'negativo' } })).toEqual({ bloccato: false });
  });
  it('master positivo vince sulla fonte db', () => {
    const v = verdettoEsecuzione({ statoMaster: { esito: 'positivo', odl: 'M1' }, vocePositivaDb: { odl: 'D1' } });
    expect(v.fonte).toBe('master');
    expect(v.odl).toBe('M1');
  });
  it('master indeterminato (esito null, stato null) -> libero', () => {
    expect(verdettoEsecuzione({ statoMaster: { esito: null, stato_odl: null } })).toEqual({ bloccato: false });
  });
  it('stato "IN COMPLETAMENTO" (transizione) -> NON bloccato', () => {
    expect(verdettoEsecuzione({ statoMaster: { stato_odl: 'IN COMPLETAMENTO' } }).bloccato).toBe(false);
  });
  it('master null esplicito + voce db -> bloccato (fonte db)', () => {
    expect(verdettoEsecuzione({ statoMaster: null, vocePositivaDb: { odl: 'D9' } }).fonte).toBe('db');
  });
  it('niente fonti -> libero', () => {
    expect(verdettoEsecuzione({})).toEqual({ bloccato: false });
  });
});
