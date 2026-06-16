import { describe, it, expect } from 'vitest';
import { cognomeDaDisplayName, esitoFileDaIntervento, buildRigaLimMassive, type RigaDb } from './exportLimMassive';

describe('cognomeDaDisplayName', () => {
  it('prende il primo token (cognome) in maiuscolo', () => {
    expect(cognomeDaDisplayName('CIARALLO SIMONE')).toBe('CIARALLO');
    expect(cognomeDaDisplayName('PASTORELLI LUIGI')).toBe('PASTORELLI');
  });
  it('gestisce stringa vuota e spazi', () => {
    expect(cognomeDaDisplayName('')).toBe('');
    expect(cognomeDaDisplayName('  rossi  ')).toBe('ROSSI');
    expect(cognomeDaDisplayName(null)).toBe('');
  });
});

const base: RigaDb = {
  id: 'uuid-1', odl: ' 912231020 ', matricola_contatore: '20000020750',
  comune: 'ZAGAROLO', indirizzo: 'VIA CANCELLATA GRANDE 32', esito: 'eseguito_positivo',
  esito_motivo: null, stato: 'completato', data: '2026-06-03',
  committente: 'acea', origine: 'pianificato', display_name: 'CIARALLO SIMONE', sigillo: 'AA728566',
};

describe('buildRigaLimMassive', () => {
  it('mappa e normalizza una riga pianificata positiva', () => {
    expect(buildRigaLimMassive(base)).toEqual({
      id: 'uuid-1', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO',
      via: 'VIA CANCELLATA GRANDE 32', esecutore: 'CIARALLO', data_esecuzione: '2026-06-03',
      esito: 'eseguito', esito_motivo: null, sigillo: 'AA728566', manuale: false,
    });
  });
  it('display_name null → esecutore vuoto', () => {
    expect(buildRigaLimMassive({ ...base, display_name: null }).esecutore).toBe('');
  });
  it('riga manuale negativa → manuale true, esito No, motivo nel campo', () => {
    const r = buildRigaLimMassive({
      ...base, odl: null, esito: null, esito_motivo: 'Nessun passaggio',
      committente: 'lim_massive', origine: 'manuale', sigillo: '',
    });
    expect(r.manuale).toBe(true);
    expect(r.esito).toBe('No');
    expect(r.esito_motivo).toBe('Nessun passaggio');
    expect(r.odl).toBe('');
    expect(r.sigillo).toBe('');
  });
});

describe('esitoFileDaIntervento', () => {
  it('positivo → eseguito', () => {
    expect(esitoFileDaIntervento('completato', 'eseguito_positivo')).toBe('eseguito');
  });
  it('completato non positivo → No', () => {
    expect(esitoFileDaIntervento('completato', null)).toBe('No');
    expect(esitoFileDaIntervento('completato', 'accesso_negato')).toBe('No');
    expect(esitoFileDaIntervento('completato', 'contatore_non_trovato')).toBe('No');
  });
  it('non completato → null (non lavorato)', () => {
    expect(esitoFileDaIntervento('assegnato', 'eseguito_positivo')).toBeNull();
    expect(esitoFileDaIntervento(null, null)).toBeNull();
  });
});
