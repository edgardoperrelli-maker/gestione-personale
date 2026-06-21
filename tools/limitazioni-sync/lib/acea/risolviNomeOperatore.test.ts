import { describe, it, expect } from 'vitest';
import { risolviNomeOperatore } from './risolviNomeOperatore.mjs';

describe('risolviNomeOperatore', () => {
  it('applica override quando presente', () => {
    expect(risolviNomeOperatore('Mario Rossi', { 'Mario Rossi': 'ROSSI MARIO' })).toBe('ROSSI MARIO');
  });
  it('passa il nome se non c\'è override', () => {
    expect(risolviNomeOperatore('Anna Verdi', { 'Mario Rossi': 'ROSSI MARIO' })).toBe('Anna Verdi');
  });
  it('mappa assente/null → nome trimmato', () => {
    expect(risolviNomeOperatore('  Anna Verdi  ', undefined)).toBe('Anna Verdi');
  });
});
