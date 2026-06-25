import { describe, it, expect } from 'vitest';
import { qualificaRimozioneMisuratore, misuratoreRimossoVisibile } from './misuratoreRimosso';

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

describe('misuratoreRimossoVisibile', () => {
  const daConsegnare = (intervento_id: string | null) => ({ intervento_id, stato: 'da_consegnare_deposito' });

  it('mostra il record con intervento positivo', () => {
    expect(misuratoreRimossoVisibile(daConsegnare('i1'), 'eseguito_positivo')).toBe(true);
  });

  it('nasconde il record corretto a esito negativo (null) se ancora da consegnare', () => {
    expect(misuratoreRimossoVisibile(daConsegnare('i1'), null)).toBe(false);
  });

  it('preserva i record già nel flusso fisico anche se l\'esito diventa negativo', () => {
    expect(misuratoreRimossoVisibile({ intervento_id: 'i1', stato: 'scaricato_deposito' }, null)).toBe(true);
    expect(misuratoreRimossoVisibile({ intervento_id: 'i1', stato: 'verificato_deposito' }, null)).toBe(true);
  });

  it('mostra sempre i record manuali senza intervento collegato', () => {
    expect(misuratoreRimossoVisibile(daConsegnare(null), null)).toBe(true);
    expect(misuratoreRimossoVisibile({ intervento_id: null, stato: 'verificato_deposito' }, null)).toBe(true);
  });

  it('non nasconde quando l\'intervento non viene trovato (esito undefined)', () => {
    expect(misuratoreRimossoVisibile(daConsegnare('i1'), undefined)).toBe(true);
  });
});
