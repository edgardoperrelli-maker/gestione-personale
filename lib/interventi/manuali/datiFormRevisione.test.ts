import { describe, it, expect } from 'vitest';
import { datiFormRevisione } from './datiFormRevisione';
import type { RigaRichiesta } from './types';

const base: RigaRichiesta = {
  id: 'r1', rapportino_id: 'rap1', voce_id: 'v1', intervento_id: null,
  staff_id: 's1', staff_name: 'Mario', committente: 'acea', data: '2026-06-06',
  stato: 'in_attesa', corsia: 'normale',
  dati_operatore: { committente: 'acea', anagrafica: { nominativo: 'Mario' }, risposte: { att_cess: true } },
  dati_correnti: { committente: 'acea', anagrafica: { nominativo: 'Mario Rossi' }, risposte: { att_cess: false } },
  note: null, motivo_rifiuto: null, created_at: '2026-06-06T10:00:00Z',
};

describe('datiFormRevisione', () => {
  it('usa dati_correnti se presenti', () => {
    const d = datiFormRevisione(base);
    expect(d.anagrafica.nominativo).toBe('Mario Rossi');
    expect(d.risposte.att_cess).toBe(false);
    expect(d.committente).toBe('acea');
  });
  it('ripiega su dati_operatore se dati_correnti vuoto', () => {
    const r = { ...base, dati_correnti: {} as Record<string, unknown> };
    const d = datiFormRevisione(r);
    expect(d.anagrafica.nominativo).toBe('Mario');
    expect(d.risposte.att_cess).toBe(true);
  });
  it('manca tutto → struttura vuota con committente della riga', () => {
    const r = { ...base, dati_operatore: {} as Record<string, unknown>, dati_correnti: {} as Record<string, unknown> };
    const d = datiFormRevisione(r);
    expect(d.anagrafica).toEqual({});
    expect(d.risposte).toEqual({});
    expect(d.committente).toBe('acea');
  });
});
