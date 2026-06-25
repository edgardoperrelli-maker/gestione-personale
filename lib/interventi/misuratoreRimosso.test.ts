import { describe, it, expect } from 'vitest';
import { qualificaRimozioneMisuratore } from './misuratoreRimosso';

describe('qualificaRimozioneMisuratore', () => {
  it('qualifica la rimozione misuratore per morosità', () => {
    expect(qualificaRimozioneMisuratore('Rimozione misuratore per morosità')).toBe(true);
  });

  it('esclude la rimozione impianto abusivo', () => {
    expect(qualificaRimozioneMisuratore('Rimozione impianto abusivo')).toBe(false);
  });

  it('esclude le varianti "allaccio abusivo" indipendentemente dal case', () => {
    expect(qualificaRimozioneMisuratore('RIMOZIONE ALLACCIO ABUSIVO')).toBe(false);
    expect(qualificaRimozioneMisuratore('Rimozione allacci abusivi')).toBe(false);
  });

  it('non qualifica tipi che non contengono "rimozione"', () => {
    expect(qualificaRimozioneMisuratore('Sostituzione misuratore')).toBe(false);
    expect(qualificaRimozioneMisuratore('Limitazione')).toBe(false);
  });

  it('gestisce null, undefined e stringa vuota', () => {
    expect(qualificaRimozioneMisuratore(null)).toBe(false);
    expect(qualificaRimozioneMisuratore(undefined)).toBe(false);
    expect(qualificaRimozioneMisuratore('')).toBe(false);
  });
});
