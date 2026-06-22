import { describe, it, expect } from 'vitest';
import { groupByDayOperatore } from './groupByDayOperatore';
import type { RapRiepilogo } from './groupByDay';

const rap = (o: Partial<RapRiepilogo> & { id: string; piano_id: string; data: string }): RapRiepilogo => ({
  staff_id: 's', staff_name: 'Op', token: 't', stato: 'in_corso',
  expires_at: '', submitted_at: null, url: '', statoCalcolato: 'valido', nVoci: 0,
  territorio: null, piano_creato_at: null, ...o,
});

describe('groupByDayOperatore', () => {
  it('(a) un operatore con interventi in 2 comuni diversi nello stesso giorno → UN gruppo con 2 rapportini', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-18', territorio: 'ROMA', staff_id: 's1', staff_name: 'ROSSI', nVoci: 12 }),
      rap({ id: 'b', piano_id: 'p2', data: '2026-06-18', territorio: 'TIVOLI', staff_id: 's1', staff_name: 'ROSSI', nVoci: 8 }),
    ];
    const out = groupByDayOperatore(raps, '2026-06-18');
    expect(out).toHaveLength(1);
    expect(out[0].operatori).toHaveLength(1);
    const op = out[0].operatori[0];
    expect(op.staff_id).toBe('s1');
    expect(op.staff_name).toBe('ROSSI');
    expect(op.rapportini).toHaveLength(2);
    expect(op.nInterventi).toBe(20);
    expect(op.comuni).toEqual(['ROMA', 'TIVOLI']);
  });

  it('(b) operatori diversi nello stesso giorno restano separati e ordinati per nome', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-18', territorio: 'ROMA', staff_id: 's2', staff_name: 'VERDI' }),
      rap({ id: 'b', piano_id: 'p1', data: '2026-06-18', territorio: 'ROMA', staff_id: 's1', staff_name: 'BIANCHI' }),
      rap({ id: 'c', piano_id: 'p1', data: '2026-06-18', territorio: 'ROMA', staff_id: 's3', staff_name: 'ROSSI' }),
    ];
    const out = groupByDayOperatore(raps, '2026-06-18');
    expect(out[0].operatori.map((o) => o.staff_name)).toEqual(['BIANCHI', 'ROSSI', 'VERDI']);
  });

  it('(c) giorni ordinati in decrescente (futuri sopra)', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-17', territorio: 'ROMA', staff_id: 's1', staff_name: 'OP' }),
      rap({ id: 'b', piano_id: 'p2', data: '2026-06-19', territorio: 'ROMA', staff_id: 's1', staff_name: 'OP' }),
      rap({ id: 'c', piano_id: 'p3', data: '2026-06-18', territorio: 'ROMA', staff_id: 's1', staff_name: 'OP' }),
    ];
    const out = groupByDayOperatore(raps, '2026-06-18');
    expect(out.map((g) => g.data)).toEqual(['2026-06-19', '2026-06-18', '2026-06-17']);
  });

  it('(d) comuni distinti, "Senza territorio" in fondo; rapportino senza territorio per ultimo', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-18', territorio: null, staff_id: 's1', staff_name: 'OP' }),
      rap({ id: 'b', piano_id: 'p2', data: '2026-06-18', territorio: 'ROMA', staff_id: 's1', staff_name: 'OP' }),
    ];
    const out = groupByDayOperatore(raps, '2026-06-18');
    const op = out[0].operatori[0];
    expect(op.comuni).toEqual(['ROMA', 'Senza territorio']);
    expect(op.rapportini[op.rapportini.length - 1].id).toBe('a');
  });

  it('(e) aiCreato: vero se TUTTI i rapportini sono AI, falso se misto', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'pAI', data: '2026-06-18', territorio: 'ROMA', staff_id: 's1', staff_name: 'TUTTOAI', aiCreato: true }),
      rap({ id: 'b', piano_id: 'pAI2', data: '2026-06-18', territorio: 'TIVOLI', staff_id: 's1', staff_name: 'TUTTOAI', aiCreato: true }),
      rap({ id: 'c', piano_id: 'pAI', data: '2026-06-18', territorio: 'ROMA', staff_id: 's2', staff_name: 'MISTO', aiCreato: true }),
      rap({ id: 'd', piano_id: 'pMan', data: '2026-06-18', territorio: 'TIVOLI', staff_id: 's2', staff_name: 'MISTO', aiCreato: false }),
    ];
    const out = groupByDayOperatore(raps, '2026-06-18');
    const tutto = out[0].operatori.find((o) => o.staff_name === 'TUTTOAI')!;
    const misto = out[0].operatori.find((o) => o.staff_name === 'MISTO')!;
    expect(tutto.aiCreato).toBe(true);
    expect(misto.aiCreato).toBe(false);
  });

  it('(f) nInterventi somma nVoci di tutti i rapportini dell\'operatore', () => {
    const raps = [
      rap({ id: 'a', piano_id: 'p1', data: '2026-06-18', territorio: 'ROMA', staff_id: 's1', staff_name: 'OP', nVoci: 5 }),
      rap({ id: 'b', piano_id: 'p2', data: '2026-06-18', territorio: 'TIVOLI', staff_id: 's1', staff_name: 'OP', nVoci: 7 }),
    ];
    const out = groupByDayOperatore(raps, '2026-06-18');
    expect(out[0].operatori[0].nInterventi).toBe(12);
  });
});
