import { describe, expect, it } from 'vitest';
import { normMatricola, ordiniDaMaster, spezzaIndirizzo, type RigaMaster } from './ordiniDaMaster';

// Dati INVENTATI: il repo è pubblico, e qui non entrano ODL, matricole o indirizzi reali.

const riga = (sovrascrivi: Partial<RigaMaster> & { id: string }): RigaMaster => ({
  odl: '100001',
  matricola: 'MTR001',
  indirizzo: 'VIA DEI PLATANI 12',
  comune: 'TERRACINA',
  cap: null,
  impianto: null,
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

  it('porta con sé il codice fornitura (impianto) del master, o null se assente', () => {
    const { nuovi } = ordiniDaMaster(
      [
        riga({ id: 'r10', odl: '100002', matricola: 'MTR010', impianto: ' 4003635716 ' }),
        riga({ id: 'r11', odl: '100003', matricola: 'MTR011' }),
      ],
      [],
    );
    expect(nuovi.find((n) => n.master_riga_id === 'r10')?.impianto).toBe('4003635716');
    expect(nuovi.find((n) => n.master_riga_id === 'r11')?.impianto).toBeNull();
  });
});
