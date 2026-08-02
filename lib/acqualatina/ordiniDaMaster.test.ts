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

  it('righe senza ODL o matricola e doppioni interni al file si scartano contandoli', () => {
    const { nuovi, scartate } = ordiniDaMaster([
      riga({ id: 'r1', odl: '  ' }),
      riga({ id: 'r2', matricola: '' }),
      riga({ id: 'r3' }),
      riga({ id: 'r4' }),      // doppione interno di r3 (stessa coppia)
    ], []);
    expect(scartate).toBe(3);
    expect(nuovi).toHaveLength(1);
    expect(nuovi[0].master_riga_id).toBe('r3');
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

describe('arricchimenti: il master riempie i vuoti delle righe già a registro', () => {
  /*
    «Additivo» ha sempre voluto dire «non tocco le righe presenti», ed è la regola che protegge
    la pianificazione. Ma vale per i dati che la riga HA: su un campo VUOTO non c'è niente da
    proteggere, e la regola stretta rendeva inutile il gesto naturale — ricaricare il master
    quando arriva più completo. È il caso reale del file di Terracina, entrato quando il parser
    non leggeva ancora cod. fornitura, nome utente e recapito.
  */
  const presente = (over: Partial<OrdineEsistente> = {}): OrdineEsistente => ({
    odl: '100001', numero_operazione: '1', matricola: 'MTR001', ...over,
  });

  it('riempie il campo vuoto della riga presente', () => {
    const { nuovi, arricchimenti, giaPresenti } = ordiniDaMaster(
      [riga({ id: 'r1', impianto: '19633002', nominativo: 'ROSSI MARIO' })],
      [presente()],
    );
    expect(nuovi).toEqual([]);
    expect(giaPresenti).toBe(1);
    expect(arricchimenti).toEqual([
      { odl: '100001', numero_operazione: '1', patch: { impianto: '19633002', nominativo: 'ROSSI MARIO' } },
    ]);
  });

  it('NON sovrascrive un dato che la riga ha già', () => {
    // Un impianto corretto a mano in ufficio non deve poter essere schiacciato da un
    // ricaricamento del master: ricaricare un file è un'operazione di back office normale.
    const { arricchimenti } = ordiniDaMaster(
      [riga({ id: 'r1', impianto: '99999999', nominativo: 'ROSSI MARIO' })],
      [presente({ impianto: '19633002' })],
    );
    expect(arricchimenti).toEqual([
      { odl: '100001', numero_operazione: '1', patch: { nominativo: 'ROSSI MARIO' } },
    ]);
  });

  it('niente da riempire, nessun arricchimento: il secondo giro è a vuoto', () => {
    const master = [riga({ id: 'r1', impianto: '19633002', nominativo: 'ROSSI MARIO', recapito: '333' })];
    const dopo = presente({ impianto: '19633002', nominativo: 'ROSSI MARIO', recapito: '333' });
    expect(ordiniDaMaster(master, [dopo]).arricchimenti).toEqual([]);
  });

  it('una cella vuota nel master non cancella niente', () => {
    // Il file che non porta il dato non è il file che dice «questo dato non c'è».
    const { arricchimenti } = ordiniDaMaster(
      [riga({ id: 'r1', impianto: '  ', nominativo: null })],
      [presente({ impianto: '19633002' })],
    );
    expect(arricchimenti).toEqual([]);
  });

  it("punta al numero operazione della riga presente, non a uno ricalcolato", () => {
    // La chiave `odl|numero_operazione` è in giro (selezioni, appunti, log operazioni): la
    // update deve colpire la riga che esiste, non quella che si sarebbe numerata oggi.
    const { arricchimenti } = ordiniDaMaster(
      [riga({ id: 'r1', matricola: 'MTR009', impianto: '19633002' })],
      [presente({ numero_operazione: '4', matricola: 'MTR009' })],
    );
    expect(arricchimenti[0]).toMatchObject({ numero_operazione: '4' });
  });
});
