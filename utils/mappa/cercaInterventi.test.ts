// utils/mappa/cercaInterventi.test.ts
import { describe, it, expect } from 'vitest';
import { cercaInterventi, type OperatoreRicerca } from './cercaInterventi';

const ops: OperatoreRicerca[] = [
  {
    op: 'CIARALLO SIMONE',
    tasks: [
      { id: 't1', odl: '957289887', indirizzo: 'VIA LUIGI EINAUDI 6', citta: 'GUIDONIA' },
      { id: 't2', odl: '957289276', indirizzo: 'VIA GIACOMO PUCCINI' },
    ],
  },
  {
    op: 'DE SANTIS ALESSANDRO',
    tasks: [{ id: 't3', odl: '957276145', indirizzo: 'VIA DEI FAGGI 3' }],
  },
];

describe('cercaInterventi', () => {
  it('query vuota o solo spazi → nessun risultato', () => {
    expect(cercaInterventi(ops, '')).toEqual([]);
    expect(cercaInterventi(ops, '   ')).toEqual([]);
  });

  it('trova per ODL anche in un operatore non attivo', () => {
    const r = cercaInterventi(ops, '957276145');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ taskId: 't3', opIdx: 1, opName: 'DE SANTIS ALESSANDRO' });
  });

  it('trova per indirizzo, case-insensitive', () => {
    const r = cercaInterventi(ops, 'luigi einaudi');
    expect(r).toHaveLength(1);
    expect(r[0].taskId).toBe('t1');
    expect(r[0].opIdx).toBe(0);
  });

  it('ritorna più risultati quando la query matcha più interventi', () => {
    const r = cercaInterventi(ops, 'via');
    expect(r.map((x) => x.taskId)).toEqual(['t1', 't2', 't3']);
  });

  it('usa un nome di fallback se l’operatore non ha nome', () => {
    const r = cercaInterventi([{ tasks: [{ id: 'x', odl: 'ABC123' }] }], 'abc');
    expect(r[0]).toMatchObject({ taskId: 'x', opIdx: 0, opName: 'Operatore 1', odl: 'ABC123' });
  });
});
