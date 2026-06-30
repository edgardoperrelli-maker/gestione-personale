import { describe, expect, it } from 'vitest';
import { normalizzaStatoPortale, isCompletato } from './statoPortale';

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
