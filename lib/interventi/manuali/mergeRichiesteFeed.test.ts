import { describe, it, expect } from 'vitest';
import { mergeRichiesteFeed, type RigaCoda } from './mergeRichiesteFeed';

const riga = (p: Partial<RigaCoda>): RigaCoda => ({
  id: 'r1', rapportino_id: 'rap1', voce_id: null, intervento_id: null,
  staff_id: 's1', staff_name: 'Mario', committente: 'acea', data: '2026-06-06',
  stato: 'in_attesa', corsia: 'normale', dati_operatore: {}, dati_correnti: {},
  note: null, motivo_rifiuto: null, created_at: '2026-06-06T10:00:00Z',
  preso_in_carico_da: null, preso_in_carico_at: null, ...p,
});

describe('mergeRichiesteFeed', () => {
  it('INSERT di una in_attesa la aggiunge ordinata per created_at desc', () => {
    const prev = [riga({ id: 'a', created_at: '2026-06-06T09:00:00Z' })];
    const next = mergeRichiesteFeed(prev, 'INSERT', riga({ id: 'b', created_at: '2026-06-06T11:00:00Z' }), null);
    expect(next.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('UPDATE di una riga esistente la sostituisce e ri-ordina', () => {
    const prev = [riga({ id: 'a', created_at: '2026-06-06T09:00:00Z' }), riga({ id: 'b', created_at: '2026-06-06T08:00:00Z' })];
    const aggiornata = riga({ id: 'b', created_at: '2026-06-06T08:00:00Z', preso_in_carico_da: 'admin1' });
    const next = mergeRichiesteFeed(prev, 'UPDATE', aggiornata, null);
    expect(next.find((r) => r.id === 'b')?.preso_in_carico_da).toBe('admin1');
    expect(next).toHaveLength(2);
  });

  it('UPDATE che porta la riga fuori da in_attesa la rimuove dalla coda', () => {
    const prev = [riga({ id: 'a' }), riga({ id: 'b' })];
    const approvata = riga({ id: 'b', stato: 'approvato' });
    const next = mergeRichiesteFeed(prev, 'UPDATE', approvata, null);
    expect(next.map((r) => r.id)).toEqual(['a']);
  });

  it('INSERT/UPDATE di una riga non in_attesa non entra in coda', () => {
    const prev = [riga({ id: 'a' })];
    const next = mergeRichiesteFeed(prev, 'INSERT', riga({ id: 'z', stato: 'auto_liberi' }), null);
    expect(next.map((r) => r.id)).toEqual(['a']);
  });

  it('DELETE rimuove per old.id', () => {
    const prev = [riga({ id: 'a' }), riga({ id: 'b' })];
    const next = mergeRichiesteFeed(prev, 'DELETE', null, { id: 'a' });
    expect(next.map((r) => r.id)).toEqual(['b']);
  });

  it('UPDATE di una riga non presente ma ancora in_attesa la inserisce', () => {
    const prev = [riga({ id: 'a', created_at: '2026-06-06T07:00:00Z' })];
    const next = mergeRichiesteFeed(prev, 'UPDATE', riga({ id: 'c', created_at: '2026-06-06T12:00:00Z' }), null);
    expect(next.map((r) => r.id)).toEqual(['c', 'a']);
  });
});
