import { describe, expect, it } from 'vitest';
import { normalizzaStatoPortale, isCompletato, scostamentoPagato } from './statoPortale';

describe('normalizzaStatoPortale', () => {
  it('porta a maiuscolo, senza accenti né spazi/punteggiatura', () => {
    expect(normalizzaStatoPortale('Completato')).toBe('COMPLETATO');
    expect(normalizzaStatoPortale('  in viaggio ')).toBe('INVIAGGIO');
    expect(normalizzaStatoPortale('Sul posto')).toBe('SULPOSTO');
  });
  it('stringa vuota/nullable → stringa vuota', () => {
    expect(normalizzaStatoPortale('')).toBe('');
    expect(normalizzaStatoPortale(null)).toBe('');
    expect(normalizzaStatoPortale(undefined)).toBe('');
  });
});

describe('isCompletato', () => {
  it('riconosce il consuntivato sul portale (COMPLETATO)', () => {
    expect(isCompletato('Completato')).toBe(true);
    expect(isCompletato('COMPLETATO')).toBe(true);
    expect(isCompletato('Assegnato')).toBe(false);
    expect(isCompletato('')).toBe(false);
  });
});

describe('scostamentoPagato', () => {
  it('true per le causali che iniziano con E (ACEA le remunera)', () => {
    expect(scostamentoPagato('EFRE')).toBe(true);
    expect(scostamentoPagato('EIES')).toBe(true);
    expect(scostamentoPagato('EANC')).toBe(true);
    expect(scostamentoPagato('eanc')).toBe(true); // case-insensitive
    expect(scostamentoPagato('  ECE2 ')).toBe(true); // trim
  });
  it('false per le causali non-E (scostamento a nostro carico, non pagato)', () => {
    expect(scostamentoPagato('NMNT')).toBe(false);
    expect(scostamentoPagato('NPRT')).toBe(false);
    expect(scostamentoPagato('NNCT')).toBe(false);
  });
  it('fallback: causale assente → true (transizione: non esclude finché il dato non arriva)', () => {
    expect(scostamentoPagato('')).toBe(true);
    expect(scostamentoPagato(null)).toBe(true);
    expect(scostamentoPagato(undefined)).toBe(true);
  });
});
