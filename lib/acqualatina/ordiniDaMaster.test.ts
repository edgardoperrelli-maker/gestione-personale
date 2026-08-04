import { describe, expect, it } from 'vitest';
import {
  normMatricola, ordiniDaMaster, spezzaIndirizzo,
  type OrdineEsistente, type RigaMaster,
} from './ordiniDaMaster';

// Dati INVENTATI: il repo è pubblico, e qui non entrano ODL, matricole o indirizzi reali.

const riga = (sovrascrivi: Partial<RigaMaster> & { id: string }): RigaMaster => ({
  odl: '100001',
  matricola: 'MTR001',
  indirizzo: 'VIA DEI PLATANI 12',
  comune: 'TERRACINA',
  cap: null,
  impianto: null,
  nominativo: null,
  recapito: null,
  ...sovrascrivi,
});

describe('spezzaIndirizzo', () => {
  it('separa la via dal civico finale', () => {
    expect(spezzaIndirizzo('VIA DEI PLATANI 12')).toEqual({ via: 'VIA DEI PLATANI', civico: '12' });
  });

  it('tiene il suffisso del civico attaccato al numero («12/A»)', () => {
    expect(spezzaIndirizzo('VIA DEI PLATANI 12/A')).toEqual({ via: 'VIA DEI PLATANI', civico: '12/A' });
  });

  it('mangia la virgola prima del civico', () => {
    expect(spezzaIndirizzo('VIA DEI PLATANI, 12')).toEqual({ via: 'VIA DEI PLATANI', civico: '12' });
  });

  it('senza civico finale la via resta intera', () => {
    expect(spezzaIndirizzo('PIAZZA GRANDE SNC')).toEqual({ via: 'PIAZZA GRANDE SNC', civico: null });
  });

  it('un indirizzo che è solo un numero non si spezza', () => {
    // Spezzarlo produrrebbe via vuota e un civico orfano: meglio tenerlo com'è.
    expect(spezzaIndirizzo('12')).toEqual({ via: '12', civico: null });
  });

  it('collassa gli spazi doppi e i bordi', () => {
    expect(spezzaIndirizzo('  VIA  LARGA   7 ')).toEqual({ via: 'VIA LARGA', civico: '7' });
  });

  it('vuoto o nullo → tutto nullo', () => {
    expect(spezzaIndirizzo('')).toEqual({ via: null, civico: null });
    expect(spezzaIndirizzo(null)).toEqual({ via: null, civico: null });
  });
});

describe('ordiniDaMaster — numerazione per ODL', () => {
  it('un ODL multi-matricola numera le operazioni in ordine di matricola', () => {
    const { nuovi } = ordiniDaMaster([
      riga({ id: 'r1', odl: '200100', matricola: 'MTR-B' }),
      riga({ id: 'r2', odl: '200100', matricola: 'MTR-A' }),
    ], []);
    expect(nuovi.map((n) => [n.matricola, n.numero_operazione])).toEqual([
      ['MTR-A', '1'],
      ['MTR-B', '2'],
    ]);
  });

  it('le matricole nuove di un ODL già a registro prendono i numeri SUCCESSIVI, senza rinumerare', () => {
    const { nuovi, giaPresenti } = ordiniDaMaster(
      [
        riga({ id: 'r1', matricola: 'MTR001' }),          // già a registro
        riga({ id: 'r2', matricola: 'MTR009' }),          // nuova
      ],
      [{ odl: '100001', numero_operazione: '2', matricola: 'MTR001' }],
    );
    expect(giaPresenti).toBe(1);
    // Il 2 è occupato dalla riga esistente: la nuova prende il 3. Mai riusare un numero.
    expect(nuovi).toHaveLength(1);
    expect(nuovi[0].numero_operazione).toBe('3');
  });

  it('due sync con lo stesso file producono le stesse chiavi (determinismo)', () => {
    const master = [
      riga({ id: 'r1', matricola: 'MTR-C' }),
      riga({ id: 'r2', matricola: 'MTR-A' }),
      riga({ id: 'r3', odl: '100002', matricola: 'MTR-Z' }),
    ];
    const primo = ordiniDaMaster(master, []);
    const secondo = ordiniDaMaster(master, []);
    expect(secondo.nuovi).toEqual(primo.nuovi);
  });
});

describe('ordiniDaMaster — additivo e difensivo', () => {
  it('le coppie già a registro non tornano: rilanciare a vuoto non inserisce niente', () => {
    const master = [riga({ id: 'r1' }), riga({ id: 'r2', matricola: 'MTR002' })];
    const primo = ordiniDaMaster(master, []);
    const esistenti = primo.nuovi.map((n) => ({
      odl: n.odl, numero_operazione: n.numero_operazione, matricola: n.matricola,
    }));
    const secondo = ordiniDaMaster(master, esistenti);
    expect(secondo.nuovi).toEqual([]);
    expect(secondo.giaPresenti).toBe(2);
  });

  it('il confronto matricola è sul NORMALIZZATO: maiuscole e trattini non creano doppioni', () => {
    const { nuovi, giaPresenti } = ordiniDaMaster(
      [riga({ id: 'r1', matricola: 'mtr-001' })],
      [{ odl: '100001', numero_operazione: '1', matricola: 'MTR001' }],
    );
    expect(nuovi).toEqual([]);
    expect(giaPresenti).toBe(1);
    expect(normMatricola('mtr-001')).toBe(normMatricola('MTR001'));
  });

  it('righe senza ODL e doppioni interni al file si scartano contandoli', () => {
    const { nuovi, scartate } = ordiniDaMaster([
      riga({ id: 'r1', odl: '  ' }),
      riga({ id: 'r3' }),
      riga({ id: 'r4' }),      // doppione interno di r3 (stessa coppia)
    ], []);
    expect(scartate).toBe(2);
    expect(nuovi).toHaveLength(1);
    expect(nuovi[0].master_riga_id).toBe('r3');
  });

  it('una riga senza matricola NON si scarta: entra a matricola vuota (i battenti non la portano)', () => {
    const { nuovi, scartate } = ordiniDaMaster([riga({ id: 'r2', matricola: '' })], []);
    expect(scartate).toBe(0);
    expect(nuovi).toHaveLength(1);
    expect(nuovi[0]).toMatchObject({ matricola: '', matricola_norm: '', numero_operazione: '1' });
  });

  it('porta con sé via/civico spezzati e la provenienza dal master', () => {
    const { nuovi } = ordiniDaMaster(
      [riga({ id: 'r9', indirizzo: 'VIA LARGA, 7/B', comune: ' TERRACINA ' })],
      [],
    );
    expect(nuovi[0]).toMatchObject({
      via: 'VIA LARGA', civico: '7/B', comune: 'TERRACINA', master_riga_id: 'r9',
      matricola_norm: 'MTR001',
    });
  });
  it("porta l'anagrafica del punto e dell'utente sulle righe nuove", () => {
    // Il sync non la portava: le 4.196 righe di luglio sono entrate senza cod. fornitura, e
    // nome utente e recapito non entravano affatto. Senza questi tre campi il file del mese
    // prossimo rifarebbe lo stesso buco.
    const { nuovi } = ordiniDaMaster(
      [riga({ id: 'r1', impianto: ' 19633002 ', nominativo: 'ROSSI MARIO', recapito: '3331234567' })],
      [],
    );
    expect(nuovi[0]).toMatchObject({
      impianto: '19633002', nominativo: 'ROSSI MARIO', recapito: '3331234567',
    });
  });

  it('i campi anagrafici assenti restano nulli, non stringhe vuote', () => {
    // Un master più povero non è un file rotto: le righe entrano lo stesso, e la cella vuota
    // deve dire «non lo so», che in tabella si legge come trattino.
    const { nuovi } = ordiniDaMaster([riga({ id: 'r1', impianto: '   ' })], []);
    expect(nuovi[0]).toMatchObject({ impianto: null, nominativo: null, recapito: null });
  });
});

describe('correzioni: il master ha ragione sull\'anagrafica delle righe già a registro', () => {
  /*
    Fino al 04/08/2026 si riempivano solo i VUOTI. Ma la correzione vera viaggia al contrario:
    l'export del committente È l'anagrafica giusta (decisione utente 04/08), e proteggere il
    valore vecchio significava correggere due volte a mano — sul registro e sugli interventi.
    Il file che NON porta un dato continua a non cancellare niente; la matricola non si
    sovrascrive mai (è l'identità della riga), può solo essere adottata da una riga senza.
  */
  const presente = (over: Partial<OrdineEsistente> = {}): OrdineEsistente => ({
    odl: '100001', numero_operazione: '1', matricola: 'MTR001', ...over,
  });

  it('riempie il campo vuoto della riga presente', () => {
    const { nuovi, correzioni, giaPresenti } = ordiniDaMaster(
      [riga({ id: 'r1', indirizzo: null, comune: null, impianto: '19633002', nominativo: 'ROSSI MARIO' })],
      [presente()],
    );
    expect(nuovi).toEqual([]);
    expect(giaPresenti).toBe(1);
    expect(correzioni).toEqual([
      { odl: '100001', numero_operazione: '1', patch: { impianto: '19633002', nominativo: 'ROSSI MARIO' } },
    ]);
  });

  it('SOVRASCRIVE il dato difforme: il file del committente è la fonte', () => {
    const { correzioni } = ordiniDaMaster(
      [riga({ id: 'r1', indirizzo: 'VIA STRISCIA 1401', comune: null })],
      [presente({ via: 'STRADA DELLA STRISCIA', civico: '1401' })],
    );
    expect(correzioni).toEqual([
      { odl: '100001', numero_operazione: '1', patch: { via: 'VIA STRISCIA' } },
    ]);
  });

  it('una differenza di solo maiuscole o spazi non è una correzione', () => {
    const { correzioni } = ordiniDaMaster(
      [riga({ id: 'r1', indirizzo: null, comune: null, nominativo: '  rossi   MARIO ' })],
      [presente({ nominativo: 'ROSSI MARIO' })],
    );
    expect(correzioni).toEqual([]);
  });

  it('niente di difforme, nessuna correzione: il secondo giro è a vuoto', () => {
    const master = [riga({ id: 'r1', indirizzo: null, comune: null, impianto: '19633002', nominativo: 'ROSSI MARIO', recapito: '333' })];
    const dopo = presente({ impianto: '19633002', nominativo: 'ROSSI MARIO', recapito: '333' });
    expect(ordiniDaMaster(master, [dopo]).correzioni).toEqual([]);
  });

  it('una cella vuota nel master non cancella niente', () => {
    // Il file che non porta il dato non è il file che dice «questo dato non c'è».
    const { correzioni } = ordiniDaMaster(
      [riga({ id: 'r1', indirizzo: '', comune: null, impianto: '  ', nominativo: null })],
      [presente({ impianto: '19633002', via: 'VIA LARGA', civico: '7' })],
    );
    expect(correzioni).toEqual([]);
  });

  it("punta al numero operazione della riga presente, non a uno ricalcolato", () => {
    // La chiave `odl|numero_operazione` è in giro (selezioni, appunti, log operazioni): la
    // update deve colpire la riga che esiste, non quella che si sarebbe numerata oggi.
    const { correzioni } = ordiniDaMaster(
      [riga({ id: 'r1', matricola: 'MTR009', comune: null, indirizzo: null, impianto: '19633002' })],
      [presente({ numero_operazione: '4', matricola: 'MTR009' })],
    );
    expect(correzioni[0]).toMatchObject({ numero_operazione: '4' });
  });
});

describe('righe senza matricola contro il registro (i battenti del sito)', () => {
  const presente = (over: Partial<OrdineEsistente> = {}): OrdineEsistente => ({
    odl: '100001', numero_operazione: '1', matricola: 'MTR001', ...over,
  });

  it("l'ODL già a registro: la riga corregge TUTTE le sue operazioni, senza inserire", () => {
    const { nuovi, correzioni, giaPresenti } = ordiniDaMaster(
      [riga({ id: 'r1', matricola: '', indirizzo: null, comune: 'PONTINIA', nominativo: 'VERDI ANNA' })],
      [
        presente({ comune: 'TERRACINA' }),
        presente({ numero_operazione: '2', matricola: 'MTR002', comune: 'TERRACINA' }),
      ],
    );
    expect(nuovi).toEqual([]);
    expect(giaPresenti).toBe(1);
    expect(correzioni).toEqual([
      { odl: '100001', numero_operazione: '1', patch: { comune: 'PONTINIA', nominativo: 'VERDI ANNA' } },
      { odl: '100001', numero_operazione: '2', patch: { comune: 'PONTINIA', nominativo: 'VERDI ANNA' } },
    ]);
  });

  it('la riga entrata senza matricola ADOTTA la prima che un file le porta', () => {
    // Battente prima (senza matricole), master classico poi: la matricola nuova non deve
    // sdoppiare il punto — è la stessa riga di lavoro, completata dal file più ricco.
    const { nuovi, correzioni } = ordiniDaMaster(
      [riga({ id: 'r1', matricola: 'MTR777', indirizzo: null, comune: null })],
      [presente({ matricola: '' })],
    );
    expect(nuovi).toEqual([]);
    expect(correzioni).toEqual([
      { odl: '100001', numero_operazione: '1', patch: { matricola: 'MTR777', matricola_norm: 'MTR777' } },
    ]);
  });

  it('due matricole nuove, una sola riga vuota: la prima adotta, la seconda è una riga nuova', () => {
    const { nuovi, correzioni } = ordiniDaMaster(
      [
        riga({ id: 'r1', matricola: 'MTR777', indirizzo: null, comune: null }),
        riga({ id: 'r2', matricola: 'MTR888', indirizzo: null, comune: null }),
      ],
      [presente({ matricola: '' })],
    );
    expect(correzioni).toEqual([
      { odl: '100001', numero_operazione: '1', patch: { matricola: 'MTR777', matricola_norm: 'MTR777' } },
    ]);
    expect(nuovi).toHaveLength(1);
    expect(nuovi[0]).toMatchObject({ matricola: 'MTR888', numero_operazione: '2' });
  });
});
