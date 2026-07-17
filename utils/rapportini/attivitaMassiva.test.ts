import { describe, it, expect } from 'vitest';
import { attivitaMassiva, fotoObbligatorieSoloMassive, campoObbligatorioSoloMassive } from './attivitaMassiva';

describe('attivitaMassiva', () => {
  it('riconosce le attività massive (varianti maiuscolo/singolare)', () => {
    expect(attivitaMassiva('LIMITAZIONI MASSIVE')).toBe(true);
    expect(attivitaMassiva('Limitazione massiva')).toBe(true);
    expect(attivitaMassiva('limitazione massiva zagarolo')).toBe(true);
  });
  it('è false per sospensioni/limitazioni e per valori vuoti', () => {
    expect(attivitaMassiva('LIMITAZIONI/SOSPENSIONI')).toBe(false);
    expect(attivitaMassiva('SOSPENSIONE FORNITURA')).toBe(false);
    expect(attivitaMassiva('')).toBe(false);
    expect(attivitaMassiva(null)).toBe(false);
    expect(attivitaMassiva(undefined)).toBe(false);
  });
});

describe('fotoObbligatorieSoloMassive', () => {
  it('riconosce il template ibrido acea (case/spazi-insensitive)', () => {
    expect(fotoObbligatorieSoloMassive('Ibrido acea')).toBe(true);
    expect(fotoObbligatorieSoloMassive('IBRIDO ACEA')).toBe(true);
    expect(fotoObbligatorieSoloMassive('ibridoacea')).toBe(true);
  });
  it('è false per gli altri template', () => {
    expect(fotoObbligatorieSoloMassive('RAPPORTINO LIMITAZIONI MASSIVE')).toBe(false);
    expect(fotoObbligatorieSoloMassive('LIMITAZIONI/SOSPENSIONI')).toBe(false);
    expect(fotoObbligatorieSoloMassive(null)).toBe(false);
    expect(fotoObbligatorieSoloMassive(undefined)).toBe(false);
  });
});

describe('campoObbligatorioSoloMassive', () => {
  it('riconosce il campo SIGILLO (testo), non la foto SIGILLATURA', () => {
    expect(campoObbligatorioSoloMassive({ chiave: 'sigillo', etichetta: 'SIGILLO', tipo: 'testo' })).toBe(true);
    expect(campoObbligatorioSoloMassive({ chiave: 'sigillatura', etichetta: 'SIGILLATURA', tipo: 'foto' })).toBe(false);
  });
  it('è false per gli altri campi e per le foto', () => {
    expect(campoObbligatorioSoloMassive({ chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select' })).toBe(false);
    expect(campoObbligatorioSoloMassive({ chiave: 'lettura', etichetta: 'LETTURA', tipo: 'testo' })).toBe(false);
    expect(campoObbligatorioSoloMassive({ chiave: 'ante', etichetta: 'ANTE', tipo: 'foto' })).toBe(false);
  });
});
