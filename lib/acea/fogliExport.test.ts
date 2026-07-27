import { describe, it, expect } from 'vitest';
import {
  CAMPI_PIANIFICATO, MASTER_DUNNING, MASTER_MASSIVE, costruisciFoglio, dataExcel,
  nomeFileMaster, ordinaPianificato, schemaMaster,
  type RigaMaster, type RigaPianificata,
} from './fogliExport';

const pian = (over: Partial<RigaPianificata> = {}): RigaPianificata => ({
  odl: '912215286', numero_operazione: '0010', operatore: 'ROSSI MARIO',
  attivita: 'Limitazione Massiva su Impianto', comune: 'LABICO', indirizzo: 'VIA ALFA 1',
  cap: '00030', impianto: '4000308907', matricola: '202415647231', stato_acea: 'DAPI',
  famiglia: 'massive', ...over,
});

const master = (over: Partial<RigaMaster> = {}): RigaMaster => ({
  odl: '912215286', numero_operazione: '0010', impianto: '4000308907',
  matricola: '202415647231', indirizzo: 'VIA ALFA 1', via: 'VIA ALFA', civico: '1',
  cap: '00030', comune: 'LABICO', lat: 41.79, lng: 12.88,
  attivita: 'Limitazione Massiva su Impianto', stato: 'COMP', esecutore: 'ROSSI',
  data_prevista: '2026-07-27', esito: 'eseguito', saracinesca: 'SI', sigillo: 'AA728566',
  note: '', odl_saracinesca: '4100000001', automazione: true, ...over,
});

describe('dataExcel', () => {
  it('produce una data vera a mezzogiorno, non una stringa', () => {
    const d = dataExcel('2026-07-27');
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6);
    expect(d?.getDate()).toBe(27);
    // Mezzogiorno: a mezzanotte una riconversione per fuso sposterebbe il giorno indietro.
    expect(d?.getHours()).toBe(12);
  });

  it('regge vuoti e formati non ISO senza inventare date', () => {
    expect(dataExcel(null)).toBeNull();
    expect(dataExcel('')).toBeNull();
    expect(dataExcel('27/07/2026')).toBeNull();
  });
});

describe('ordinaPianificato', () => {
  it('ordina per operatore, poi comune, poi indirizzo: come si assegna sul Cruscotto', () => {
    const righe = [
      pian({ odl: 'C', operatore: 'VERDI LUCA', comune: 'LABICO' }),
      pian({ odl: 'B', operatore: 'ROSSI MARIO', comune: 'ZAGAROLO' }),
      pian({ odl: 'A', operatore: 'ROSSI MARIO', comune: 'LABICO' }),
    ];
    expect(ordinaPianificato(righe).map((r) => r.odl)).toEqual(['A', 'B', 'C']);
  });

  it('a parità di tutto usa ODL e operazione: due giri danno lo stesso foglio', () => {
    const base = { operatore: 'ROSSI MARIO', comune: 'LABICO', indirizzo: 'VIA ALFA 1' };
    const righe = [
      pian({ ...base, odl: '900', numero_operazione: '0020' }),
      pian({ ...base, odl: '900', numero_operazione: '0010' }),
    ];
    expect(ordinaPianificato(righe).map((r) => r.numero_operazione)).toEqual(['0010', '0020']);
    expect(ordinaPianificato([...righe].reverse()).map((r) => r.numero_operazione)).toEqual(['0010', '0020']);
  });

  it('non muta l array in ingresso', () => {
    const righe = [pian({ odl: 'B', operatore: 'VERDI' }), pian({ odl: 'A', operatore: 'ROSSI' })];
    ordinaPianificato(righe);
    expect(righe.map((r) => r.odl)).toEqual(['B', 'A']);
  });
});

describe('layout master massive', () => {
  it('ha le 21 colonne dei file reali, nell ordine di ZAGAROLO più gli extra di LABICO', () => {
    expect(MASTER_MASSIVE.foglio).toBe('Foglio1');
    expect(MASTER_MASSIVE.campi.map((c) => c.intestazione)).toEqual([
      'Ordine', 'Impianto', 'Matricola', 'Indirizzo', 'Via', 'N. civico', 'Long', 'Lat', 'CAP',
      'Località', 'Esecutore', 'data prevista', 'esito', 'saracinesca', 'Odl saracinesca', 'note',
      'sigillo posato', 'stato odl', 'AUTOMAZIONE', 'PREASSEGNAZIONE', 'ASSEGNATARIO',
    ]);
  });

  it('scrive i valori nelle colonne giuste', () => {
    const { intestazione, corpo } = costruisciFoglio(MASTER_MASSIVE.campi, [master()]);
    const cella = (nome: string) => corpo[0][intestazione.indexOf(nome)];
    expect(cella('Ordine')).toBe('912215286');
    expect(cella('Odl saracinesca')).toBe('4100000001');
    expect(cella('sigillo posato')).toBe('AA728566');
    expect(cella('stato odl')).toBe('COMP');
    expect(cella('Lat')).toBe(41.79);
    expect(cella('data prevista')).toBeInstanceOf(Date);
  });

  it('AUTOMAZIONE dice SI solo dove il valore lo ha messo l app', () => {
    const { intestazione, corpo } = costruisciFoglio(MASTER_MASSIVE.campi, [
      master({ automazione: true }), master({ automazione: false }),
    ]);
    const i = intestazione.indexOf('AUTOMAZIONE');
    expect([corpo[0][i], corpo[1][i]]).toEqual(['SI', '']);
  });

  it('le colonne della vecchia automazione restano vuote, non inventate', () => {
    const { intestazione, corpo } = costruisciFoglio(MASTER_MASSIVE.campi, [master()]);
    expect(corpo[0][intestazione.indexOf('PREASSEGNAZIONE')]).toBe('');
    expect(corpo[0][intestazione.indexOf('ASSEGNATARIO')]).toBe('');
  });

  it('un valore assente diventa cella vuota, mai "null" o "—"', () => {
    const vuota = master({
      impianto: null, matricola: null, indirizzo: null, via: null, civico: null, cap: null,
      comune: null, lat: null, lng: null, esecutore: null, data_prevista: null, esito: null,
      saracinesca: null, sigillo: null, note: null, odl_saracinesca: null, stato: null,
      automazione: false,
    });
    const { corpo } = costruisciFoglio(MASTER_MASSIVE.campi, [vuota]);
    expect(corpo[0].filter((c) => c !== '' && c !== '912215286')).toEqual([]);
  });
});

describe('layout master dunning', () => {
  it('ha esattamente le colonne che il config dell agente nomina', () => {
    expect(MASTER_DUNNING.foglio).toBe('PIANIFICAZIONE');
    expect(MASTER_DUNNING.campi.map((c) => c.intestazione)).toEqual([
      'Ordine', 'Operazione testo breve', 'Stato Operazione', 'Esecutore', 'Data',
      'Matricola misuratore', 'INDIRIZZO', 'Località', 'Saracinesca', 'Automazione',
    ]);
  });

  it('schemaMaster sceglie il foglio giusto per famiglia', () => {
    expect(schemaMaster('massive').foglio).toBe('Foglio1');
    expect(schemaMaster('dunning').foglio).toBe('PIANIFICAZIONE');
  });
});

describe('costruisciFoglio', () => {
  it('intestazione e corpo hanno la stessa larghezza', () => {
    const { intestazione, corpo } = costruisciFoglio(CAMPI_PIANIFICATO, [pian(), pian()]);
    expect(corpo).toHaveLength(2);
    for (const riga of corpo) expect(riga).toHaveLength(intestazione.length);
  });

  it('senza righe resta la sola intestazione', () => {
    const { intestazione, corpo } = costruisciFoglio(CAMPI_PIANIFICATO, []);
    expect(intestazione.length).toBeGreaterThan(0);
    expect(corpo).toEqual([]);
  });
});

describe('nomeFileMaster', () => {
  it('usa il comune quando c è: il master massive è un file per comune', () => {
    expect(nomeFileMaster('massive', 'LABICO', '2026-07-27')).toBe('master-LABICO-20260727.xlsx');
  });

  it('ripulisce i comuni con spazi e apostrofi', () => {
    expect(nomeFileMaster('massive', "Sant'Angelo Romano", '2026-07-27'))
      .toBe('master-SANT-ANGELO-ROMANO-20260727.xlsx');
  });

  it('senza comune usa la famiglia', () => {
    expect(nomeFileMaster('dunning', null, '2026-07-27')).toBe('master-dunning-20260727.xlsx');
  });
});
