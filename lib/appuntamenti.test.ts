import { describe, it, expect } from 'vitest';
import { countAppointmentsByDay } from './appuntamenti';

describe('countAppointmentsByDay', () => {
  it('conta per giorno e mette 0 sui giorni senza appuntamenti', () => {
    const r = countAppointmentsByDay(
      [{ data: '2026-06-15' }, { data: '2026-06-15' }, { data: '2026-06-16' }],
      ['2026-06-15', '2026-06-16', '2026-06-17']
    );
    expect(r).toEqual({ '2026-06-15': 2, '2026-06-16': 1, '2026-06-17': 0 });
  });
  it('ignora appuntamenti fuori dai giorni richiesti', () => {
    expect(countAppointmentsByDay([{ data: '2026-01-01' }], ['2026-06-15'])).toEqual({ '2026-06-15': 0 });
  });
  it('lista vuota → tutti 0', () => {
    expect(countAppointmentsByDay([], ['2026-06-15'])).toEqual({ '2026-06-15': 0 });
  });
});
