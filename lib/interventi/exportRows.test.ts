import { describe, it, expect } from 'vitest';
import { buildRigaExport, type InterventoExport } from './exportRows';

const base: InterventoExport = {
  data: '2026-06-09', staff_id: 's1', stato: 'completato', esito: 'eseguito_positivo',
  esito_motivo: null, odl: 'A1', nominativo: 'Mario Rossi', pdr: 'P1', matricola_contatore: 'M1',
  indirizzo: 'Via X 1', comune: 'Roma', cap: '00100', intervento_tipo: 'Rimozione',
  fascia_oraria: '8-12', chiuso_at: '2026-06-09T08:30:00Z',
};

describe('buildRigaExport', () => {
  const staff = new Map([['s1', 'Mario']]);

  it('mappa i campi e risolve operatore + label', () => {
    const r = buildRigaExport(base, staff);
    expect(r.operatore).toBe('Mario');
    expect(r.stato).toBe('Completato');
    expect(r.esito).toBe('Eseguito positivo');
    expect(r.odl).toBe('A1');
    expect(r.chiuso).toBe('10:30'); // 08:30Z → 10:30 Europe/Rome (estate)
  });

  it('staff sconosciuto → usa id; null → Non assegnato', () => {
    expect(buildRigaExport({ ...base, staff_id: 'x' }, staff).operatore).toBe('x');
    expect(buildRigaExport({ ...base, staff_id: null }, staff).operatore).toBe('Non assegnato');
  });

  it('campi nulli → stringa vuota; chiuso_at null → vuoto', () => {
    const r = buildRigaExport({ ...base, odl: null, esito: null, chiuso_at: null }, staff);
    expect(r.odl).toBe('');
    expect(r.esito).toBe('');
    expect(r.chiuso).toBe('');
  });
});
