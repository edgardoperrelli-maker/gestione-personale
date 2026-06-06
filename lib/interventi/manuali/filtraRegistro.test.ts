import { describe, it, expect } from 'vitest';
import { filtraRegistro, type FiltriRegistro } from './filtraRegistro';
import type { RigaRichiesta } from './types';

const riga = (p: Partial<RigaRichiesta>): RigaRichiesta => ({
  id: 'r', rapportino_id: null, voce_id: null, intervento_id: null,
  staff_id: 's1', staff_name: 'Mario Rossi', committente: 'acea', data: '2026-06-06',
  stato: 'approvato', corsia: 'normale', dati_operatore: {}, dati_correnti: {},
  note: null, motivo_rifiuto: null, created_at: '2026-06-06T10:00:00Z', ...p,
});
const vuoto: FiltriRegistro = { operatore: '', stato: '', committente: '', from: '', to: '' };

describe('filtraRegistro', () => {
  it('filtri vuoti → tutto invariato', () => {
    const list = [riga({ id: 'a' }), riga({ id: 'b' })];
    expect(filtraRegistro(list, vuoto)).toHaveLength(2);
  });
  it('filtra per operatore (staff_id)', () => {
    const list = [riga({ id: 'a', staff_id: 's1' }), riga({ id: 'b', staff_id: 's2' })];
    expect(filtraRegistro(list, { ...vuoto, operatore: 's1' }).map((r) => r.id)).toEqual(['a']);
  });
  it('filtra per stato', () => {
    const list = [riga({ id: 'a', stato: 'approvato' }), riga({ id: 'b', stato: 'rifiutato' })];
    expect(filtraRegistro(list, { ...vuoto, stato: 'rifiutato' }).map((r) => r.id)).toEqual(['b']);
  });
  it('filtra per committente', () => {
    const list = [riga({ id: 'a', committente: 'acea' }), riga({ id: 'b', committente: 'italgas' })];
    expect(filtraRegistro(list, { ...vuoto, committente: 'italgas' }).map((r) => r.id)).toEqual(['b']);
  });
  it('filtra per range data (inclusivo)', () => {
    const list = [riga({ id: 'a', data: '2026-06-01' }), riga({ id: 'b', data: '2026-06-10' }), riga({ id: 'c', data: '2026-06-06' })];
    expect(filtraRegistro(list, { ...vuoto, from: '2026-06-05', to: '2026-06-08' }).map((r) => r.id)).toEqual(['c']);
  });
  it('combina più filtri (AND)', () => {
    const list = [
      riga({ id: 'a', staff_id: 's1', stato: 'approvato', committente: 'acea' }),
      riga({ id: 'b', staff_id: 's1', stato: 'rifiutato', committente: 'acea' }),
    ];
    expect(filtraRegistro(list, { ...vuoto, operatore: 's1', stato: 'approvato' }).map((r) => r.id)).toEqual(['a']);
  });
});
