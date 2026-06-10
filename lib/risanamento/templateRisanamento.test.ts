import { describe, it, expect } from 'vitest';
import { isAttivitaRisanamento, pianoHaRisanamento, risolviTemplateRisanamento, ATTIVITA_RISANAMENTO } from './templateRisanamento';

describe('isAttivitaRisanamento', () => {
  it('riconosce RESINE (case/trim insensitive)', () => {
    expect(isAttivitaRisanamento('RESINE')).toBe(true);
    expect(isAttivitaRisanamento(' resine ')).toBe(true);
    expect(isAttivitaRisanamento('Resine')).toBe(true);
  });
  it('rifiuta altre attività o vuoto', () => {
    expect(isAttivitaRisanamento('S-PR-007')).toBe(false);
    expect(isAttivitaRisanamento('')).toBe(false);
    expect(isAttivitaRisanamento(null)).toBe(false);
    expect(isAttivitaRisanamento(undefined)).toBe(false);
  });
  it('la costante è RESINE', () => {
    expect(ATTIVITA_RISANAMENTO).toBe('RESINE');
  });
});

describe('pianoHaRisanamento', () => {
  it('true se almeno un task ha attività RESINE', () => {
    expect(pianoHaRisanamento([{ attivita: 'X' }, { attivita: 'RESINE' }])).toBe(true);
  });
  it('false se nessun task RESINE o lista vuota', () => {
    expect(pianoHaRisanamento([{ attivita: 'X' }])).toBe(false);
    expect(pianoHaRisanamento([])).toBe(false);
  });
});

describe('risolviTemplateRisanamento', () => {
  const t = (id: string, tipo: string, nome: string, active = true) => ({ id, tipo, nome, active });
  it('primo template attivo tipo=risanamento per nome', () => {
    const res = risolviTemplateRisanamento([t('1', 'standard', 'A'), t('3', 'risanamento', 'Zeta'), t('2', 'risanamento', 'Alfa')]);
    expect(res).toBe('2'); // 'Alfa' < 'Zeta'
  });
  it('ignora i non-risanamento e i non-attivi', () => {
    expect(risolviTemplateRisanamento([t('1', 'standard', 'A'), t('2', 'risanamento', 'B', false)])).toBeNull();
  });
  it('null se nessun template risanamento', () => {
    expect(risolviTemplateRisanamento([t('1', 'standard', 'A')])).toBeNull();
  });
});
