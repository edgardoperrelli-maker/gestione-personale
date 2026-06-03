import { describe, it, expect } from 'vitest';
import { generaAgendaToken } from './agendaToken';

describe('generaAgendaToken', () => {
  it('genera un token esadecimale di 64 caratteri', () => {
    expect(generaAgendaToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('genera token diversi a ogni chiamata', () => {
    expect(generaAgendaToken()).not.toBe(generaAgendaToken());
  });
});
