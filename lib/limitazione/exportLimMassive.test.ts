import { describe, it, expect } from 'vitest';
import { cognomeDaDisplayName, esitoFileDaIntervento, buildRigaLimMassive, saracinescaPulita, valoreSaracinesca, type RigaDb } from './exportLimMassive';

describe('valoreSaracinesca', () => {
  it('booleano true (template a checkbox) → SI', () => {
    expect(valoreSaracinesca(true, null)).toBe('SI');
  });
  it('stringa "SI" → SI', () => {
    expect(valoreSaracinesca('SI', null)).toBe('SI');
  });
  it('booleano false → vuoto (valvola non sostituita)', () => {
    expect(valoreSaracinesca(false, null)).toBe('');
  });
  it('primo campo vuoto, secondo con path foto → scartato', () => {
    expect(valoreSaracinesca('', 'rapportini/abc/x.jpg')).toBe('');
  });
  it('primo campo vuoto, fallback sul secondo valido', () => {
    expect(valoreSaracinesca(null, 'SI')).toBe('SI');
  });
  it('booleano true vince sul secondo campo', () => {
    expect(valoreSaracinesca(true, 'qualcosa')).toBe('SI');
  });
  it('entrambi assenti → vuoto', () => {
    expect(valoreSaracinesca(null, undefined)).toBe('');
  });
});

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
  it('cognomi composti: la particella assorbe il token successivo (DE SANTIS, non "DE")', () => {
    expect(cognomeDaDisplayName('DE SANTIS ALESSANDRO')).toBe('DE SANTIS');
    expect(cognomeDaDisplayName('DALLA VALLE LUCA')).toBe('DALLA VALLE');
    expect(cognomeDaDisplayName('DI GIROLAMO MARCO')).toBe('DI GIROLAMO');
    expect(cognomeDaDisplayName('DE LA CRUZ JUAN')).toBe('DE LA CRUZ');
  });
  it('display con solo cognome composto (senza nome) resta intero', () => {
    expect(cognomeDaDisplayName('DE SANTIS')).toBe('DE SANTIS');
  });
});

const base: RigaDb = {
  id: 'uuid-1', odl: ' 912231020 ', matricola_contatore: '20000020750',
  comune: 'ZAGAROLO', indirizzo: 'VIA CANCELLATA GRANDE 32', esito: 'eseguito_positivo',
  esito_motivo: null, stato: 'completato', data: '2026-06-03',
  committente: 'acea', origine: 'pianificato', display_name: 'CIARALLO SIMONE', sigillo: 'AA728566',
  pdr: ' 00123456789 ', nominativo: ' Rossi Mario ', saracinesca: 'SI', note: null,
};

describe('buildRigaLimMassive', () => {
  it('mappa e normalizza una riga pianificata positiva', () => {
    expect(buildRigaLimMassive(base)).toEqual({
      id: 'uuid-1', odl: '912231020', matricola: '20000020750', comune: 'ZAGAROLO',
      via: 'VIA CANCELLATA GRANDE 32', esecutore: 'CIARALLO', data_esecuzione: '2026-06-03',
      esito: 'eseguito', esito_motivo: null, sigillo: 'AA728566', manuale: false,
      esitoOk: true, pdr: '00123456789', nominativo: 'Rossi Mario', saracinesca: 'SI', note: '',
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

describe('buildRigaLimMassive — campi additivi esitoOk/pdr/nominativo', () => {
  it('esito positivo → esitoOk true, mantiene esito testuale', () => {
    const r = buildRigaLimMassive(base);
    expect(r.esitoOk).toBe(true);
    expect(r.esito).toBe('eseguito');
  });
  it('completato non positivo → esitoOk false, esito "No"', () => {
    const r = buildRigaLimMassive({ ...base, esito: 'accesso_negato' });
    expect(r.esitoOk).toBe(false);
    expect(r.esito).toBe('No');
  });
  it('non completato → esitoOk null, esito null', () => {
    const r = buildRigaLimMassive({ ...base, stato: 'assegnato' });
    expect(r.esitoOk).toBeNull();
    expect(r.esito).toBeNull();
  });
  it('pdr e nominativo trimmati', () => {
    const r = buildRigaLimMassive(base);
    expect(r.pdr).toBe('00123456789');
    expect(r.nominativo).toBe('Rossi Mario');
  });
  it('pdr e nominativo null → stringhe vuote', () => {
    const r = buildRigaLimMassive({ ...base, pdr: null, nominativo: null });
    expect(r.pdr).toBe('');
    expect(r.nominativo).toBe('');
  });
  it('saracinesca: passa il valore trimmato', () => {
    expect(buildRigaLimMassive({ ...base, saracinesca: '  NO  ' }).saracinesca).toBe('NO');
    expect(buildRigaLimMassive({ ...base, saracinesca: null }).saracinesca).toBe('');
  });
  it('saracinesca: scarta un percorso foto (non scrive il link)', () => {
    expect(
      buildRigaLimMassive({ ...base, saracinesca: 'rapportini/148db267/2b30f02f.jpg' }).saracinesca,
    ).toBe('');
  });
});

describe('saracinescaPulita', () => {
  it('tiene i valori veri (SI/NO/testo breve)', () => {
    expect(saracinescaPulita('SI')).toBe('SI');
    expect(saracinescaPulita('  NO ')).toBe('NO');
    expect(saracinescaPulita('inserimento valvola')).toBe('inserimento valvola');
  });
  it('scarta foto/percorsi/link', () => {
    expect(saracinescaPulita('rapportini/148db267-05ca/2b30f02f.jpg')).toBe('');
    expect(saracinescaPulita('foto.png')).toBe('');
    expect(saracinescaPulita('https://x/y.jpg')).toBe('');
    expect(saracinescaPulita('blob-locale:abc')).toBe('');
    expect(saracinescaPulita('C:\\foto\\x.jpg')).toBe('');
    expect(saracinescaPulita(null)).toBe('');
  });
  it('note: vuota sui positivi (esitoOk true)', () => {
    expect(buildRigaLimMassive({ ...base, note: 'qualcosa', esito_motivo: 'motivo' }).note).toBe('');
  });
  it('note: sui negativi preferisce la nota, poi il motivo', () => {
    // negativo con nota → usa la nota
    expect(
      buildRigaLimMassive({ ...base, esito: 'accesso_negato', note: '  Cane in giardino  ', esito_motivo: 'Accesso negato' }).note,
    ).toBe('Cane in giardino');
    // negativo senza nota → ripiega sul motivo
    expect(
      buildRigaLimMassive({ ...base, esito: 'accesso_negato', note: null, esito_motivo: 'Accesso negato' }).note,
    ).toBe('Accesso negato');
    // negativo senza nota né motivo → ''
    expect(
      buildRigaLimMassive({ ...base, esito: 'accesso_negato', note: null, esito_motivo: null }).note,
    ).toBe('');
  });
});
