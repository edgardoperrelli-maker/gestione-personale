import { describe, expect, it } from 'vitest';
import { voceDaAttivita, kpiCode } from './voceDaAttivita';

describe('voceDaAttivita', () => {
  it('riconosce la LIMITAZIONE come EL (voce 10)', () => {
    expect(voceDaAttivita('LIMITAZIONE EROGAZIONE')).toBe(10);
    expect(voceDaAttivita('Limitazione flusso idrico')).toBe(10);
  });

  it('riconosce la SOSPENSIONE come ES (voce 11)', () => {
    expect(voceDaAttivita('SOSPENSIONE EROGAZIONE IDRICA')).toBe(11);
    expect(voceDaAttivita('sospensione fornitura')).toBe(11);
  });

  it('riconosce la rimozione del CONTATORE/MISURATORE come ERC (voce 12)', () => {
    expect(voceDaAttivita('RIMOZIONE CONTATORE')).toBe(12);
    expect(voceDaAttivita('Rimozione misuratore per morosità')).toBe(12);
    expect(voceDaAttivita('Rim Mis/Mod radio per morosità')).toBe(12); // abbreviazione
  });

  it('una REVOCA non è l\'attività revocata (Revoca limitazione ≠ EL)', () => {
    expect(voceDaAttivita('Revoca limitazione Flusso')).toBeNull();
    expect(voceDaAttivita('Revoca Disattivazione cessata morosità')).toBeNull();
  });

  it('riconosce la rimozione ABUSIVA come ERA (voce 6) — prima di ERC', () => {
    expect(voceDaAttivita('RIMOZIONE ALLACCIO ABUSIVO')).toBe(6);
    expect(voceDaAttivita('Rimozione abusivismo idrico')).toBe(6);
    // "abusivo" deve vincere anche se contiene "contatore"
    expect(voceDaAttivita('RIMOZIONE CONTATORE ABUSIVO')).toBe(6);
  });

  it('è robusta a maiuscole/minuscole, spazi e accenti', () => {
    expect(voceDaAttivita('  limitazione  ')).toBe(10);
    expect(voceDaAttivita('SOSPENSIÓNE')).toBe(11);
  });

  it('ritorna null per attività non classificabile o vuota (→ VOCE_NON_RISOLTA)', () => {
    expect(voceDaAttivita('')).toBeNull();
    expect(voceDaAttivita(null)).toBeNull();
    expect(voceDaAttivita(undefined)).toBeNull();
    expect(voceDaAttivita('RIATTIVAZIONE FORNITURA')).toBeNull();
    expect(voceDaAttivita('RIMOZIONE')).toBeNull(); // ambigua: né contatore né abusivo
    expect(voceDaAttivita('SOPRALLUOGO')).toBeNull();
  });
});

describe('kpiCode', () => {
  it('mappa la voce numerica al codice KPI', () => {
    expect(kpiCode(10)).toBe('EL');
    expect(kpiCode(11)).toBe('ES');
    expect(kpiCode(12)).toBe('ERC');
    expect(kpiCode(6)).toBe('ERA');
  });
});
