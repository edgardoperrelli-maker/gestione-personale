import { describe, it, expect } from 'vitest';
import { isRimozioneTipo } from './rimozioneMisuratore';

describe('isRimozioneTipo', () => {
  it('riconosce la forma estesa "Rimozione …"', () => {
    expect(isRimozioneTipo('Rimozione misuratore')).toBe(true);
    expect(isRimozioneTipo('rimozioni varie')).toBe(true);
  });

  it('ESCLUDE le rimozioni di impianti abusivi (il misuratore non entra a magazzino)', () => {
    // Questa attività non deve MAI confluire nel modulo Misuratori Rimossi,
    // nemmeno se nel campo note è stata annotata per errore una matricola.
    expect(isRimozioneTipo('Rimozione impianto abusivo')).toBe(false);
    expect(isRimozioneTipo('RIMOZIONE IMPIANTO ABUSIVO')).toBe(false);
    expect(isRimozioneTipo('RIMOZIONE ALLACCIO ABUSIVO')).toBe(false);
    expect(isRimozioneTipo('RIMOZIONE CONTATORE ABUSIVO')).toBe(false);
    expect(isRimozioneTipo('Rimozione abusivismo idrico')).toBe(false);
    // vince anche sull'abbreviazione ACEA "Rim …"
    expect(isRimozioneTipo('Rim impianto abusivo')).toBe(false);
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
