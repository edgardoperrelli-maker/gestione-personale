import { describe, it, expect } from 'vitest';
import { isRimozioneTipo } from './rimozioneMisuratore';

describe('isRimozioneTipo', () => {
  it('riconosce la forma estesa "Rimozione …"', () => {
    expect(isRimozioneTipo('Rimozione misuratore')).toBe(true);
    expect(isRimozioneTipo('RIMOZIONE ALLACCIO ABUSIVO')).toBe(true);
    expect(isRimozioneTipo('rimozioni varie')).toBe(true);
  });

  it('riconosce l\'abbreviazione ACEA "Rim …" (il caso del modulo)', () => {
    expect(isRimozioneTipo('Rim Mis/Mod radio per morosità')).toBe(true);
    expect(isRimozioneTipo('RIM MIS/MOD RADIO PER MOROSITA')).toBe(true);
    expect(isRimozioneTipo('Rim. misuratore')).toBe(true);
  });

  it('NON matcha altre operazioni del file', () => {
    expect(isRimozioneTipo('Sosp Mis/Mod radio per morosità')).toBe(false);
    expect(isRimozioneTipo('Lim Mis/Mod radio per morosità')).toBe(false);
    expect(isRimozioneTipo('Sospensione fornitura per morosità')).toBe(false);
    expect(isRimozioneTipo('Limitazione misuratore')).toBe(false);
    expect(isRimozioneTipo('Ripristino fornitura')).toBe(false);
    expect(isRimozioneTipo('Sostituzione misuratore')).toBe(false);
  });

  it('non confonde "rim" dentro un\'altra parola', () => {
    expect(isRimozioneTipo('Primo accesso')).toBe(false);
    expect(isRimozioneTipo('Sopralluogo primario')).toBe(false);
  });

  it('gestisce null / vuoto', () => {
    expect(isRimozioneTipo(null)).toBe(false);
    expect(isRimozioneTipo(undefined)).toBe(false);
    expect(isRimozioneTipo('')).toBe(false);
    expect(isRimozioneTipo('   ')).toBe(false);
  });
});
