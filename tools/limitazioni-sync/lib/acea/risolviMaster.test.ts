import { describe, it, expect } from 'vitest';
// @ts-expect-error modulo .mjs senza tipi
import { risolviMaster } from './risolviMaster.mjs';

const ACEA = {
  masterPath: 'C:\\DUNNING\\LIMITAZIONI CON ORDINE.xlsx',
  foglio: 'PIANIFICAZIONE',
  masterColonnaOdl: 'Ordine',
  masterColonnaStato: 'Stato Operazione',
  export: { colonnaOdl: 'Ordine' },
};

const ELENCO = [
  'C:\\MASSIVE\\LABICO.xlsx',
  'C:\\MASSIVE\\ZAGAROLO.xlsx',
];

const MASSIVE = {
  foglio: 'Foglio1',
  masterColonnaOdl: 'ORDINE',
  masterColonnaStato: 'stato odl',
  daChiedereSeVuoto: true,
};

describe('risolviMaster', () => {
  it('dunning → il master DUNNING, config radice invariata', () => {
    const r = risolviMaster({ acea: ACEA, target: 'dunning', elencoFile: ELENCO });
    expect(r).toHaveLength(1);
    expect(r[0].a.masterPath).toBe(ACEA.masterPath);
    expect(r[0].a.foglio).toBe('PIANIFICAZIONE');
  });

  it('target assente o vuoto → dunning (default storico)', () => {
    expect(risolviMaster({ acea: ACEA, elencoFile: ELENCO })[0].a.masterPath).toBe(ACEA.masterPath);
    expect(risolviMaster({ acea: ACEA, target: '', elencoFile: ELENCO })[0].a.masterPath).toBe(ACEA.masterPath);
  });

  it('un comune → il suo file, con le colonne del blocco massive', () => {
    const r = risolviMaster({ acea: { ...ACEA, massive: MASSIVE }, target: 'LABICO', elencoFile: ELENCO });
    expect(r).toHaveLength(1);
    expect(r[0].comune).toBe('LABICO');
    expect(r[0].a.masterPath).toBe('C:\\MASSIVE\\LABICO.xlsx');
    expect(r[0].a.foglio).toBe('Foglio1');
    expect(r[0].a.masterColonnaStato).toBe('stato odl');
    expect(r[0].a.daChiedereSeVuoto).toBe(true);
    // login/ricerca/export restano quelli condivisi della radice
    expect(r[0].a.export.colonnaOdl).toBe('Ordine');
  });

  it('TUTTI → un master per ogni file della cartella', () => {
    const r = risolviMaster({ acea: { ...ACEA, massive: MASSIVE }, target: 'TUTTI', elencoFile: ELENCO });
    expect(r.map((x) => x.comune)).toEqual(['LABICO', 'ZAGAROLO']);
    expect(r.map((x) => x.a.masterPath)).toEqual(ELENCO);
    // ogni master ha le colonne massive, non quelle del DUNNING
    expect(r.every((x) => x.a.foglio === 'Foglio1')).toBe(true);
  });

  it('comune senza file in cartella → nessun master (non degrada a tutti)', () => {
    const r = risolviMaster({ acea: { ...ACEA, massive: MASSIVE }, target: 'PALESTRINA', elencoFile: ELENCO });
    expect(r).toEqual([]);
  });

  // Retro-compat: config non ancora migrato, con il vecchio blocco per-comune `acea.zagarolo`.
  // Deve continuare a comportarsi ESATTAMENTE come prima (stesso masterPath del blocco).
  it('blocco per-comune legacy nel config → vince, col suo masterPath', () => {
    const acea = { ...ACEA, zagarolo: { ...MASSIVE, masterPath: 'C:\\VECCHIO\\ZAGAROLO.xlsx' } };
    const r = risolviMaster({ acea, target: 'zagarolo', elencoFile: ELENCO });
    expect(r).toHaveLength(1);
    expect(r[0].a.masterPath).toBe('C:\\VECCHIO\\ZAGAROLO.xlsx');
    expect(r[0].a.foglio).toBe('Foglio1');
  });

  it('blocco legacy raggiungibile anche col comune in maiuscolo (come lo manda la UI)', () => {
    const acea = { ...ACEA, zagarolo: { ...MASSIVE, masterPath: 'C:\\VECCHIO\\ZAGAROLO.xlsx' } };
    expect(risolviMaster({ acea, target: 'ZAGAROLO', elencoFile: ELENCO })[0].a.masterPath)
      .toBe('C:\\VECCHIO\\ZAGAROLO.xlsx');
  });

  it('senza blocco massive ricade sul vecchio blocco zagarolo per le colonne, ma col file del comune', () => {
    const acea = { ...ACEA, zagarolo: { ...MASSIVE, masterPath: 'C:\\MASSIVE\\ZAGAROLO.xlsx' } };
    const r = risolviMaster({ acea, target: 'LABICO', elencoFile: ELENCO });
    expect(r[0].a.masterPath).toBe('C:\\MASSIVE\\LABICO.xlsx');
    expect(r[0].a.masterColonnaStato).toBe('stato odl');
  });

  it('non scambia una chiave di servizio del config per un comune', () => {
    // `export` è un oggetto del config, non un blocco comune: non ha masterPath → niente legacy.
    const r = risolviMaster({ acea: { ...ACEA, massive: MASSIVE }, target: 'EXPORT', elencoFile: ELENCO });
    expect(r).toEqual([]);
  });
});
