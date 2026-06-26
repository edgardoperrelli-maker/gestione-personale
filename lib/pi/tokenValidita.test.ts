import { describe, it, expect } from 'vitest';
import { piTokenStato, piTokenValido } from './tokenValidita';

// Mezzogiorno UTC → stessa data in Europe/Rome (lontano dai bordi DST).
const at = (ymd: string) => `${ymd}T12:00:00Z`;

describe('piTokenStato', () => {
  const tok = { valido_dal: '2026-06-22', valido_al: '2026-06-28' };

  it('non_attivo prima della finestra', () => {
    expect(piTokenStato(tok, at('2026-06-21'))).toBe('non_attivo');
  });
  it('valido sul bordo iniziale', () => {
    expect(piTokenStato(tok, at('2026-06-22'))).toBe('valido');
  });
  it('valido dentro la finestra', () => {
    expect(piTokenStato(tok, at('2026-06-25'))).toBe('valido');
  });
  it('valido sul bordo finale', () => {
    expect(piTokenStato(tok, at('2026-06-28'))).toBe('valido');
  });
  it('scaduto dopo la finestra', () => {
    expect(piTokenStato(tok, at('2026-06-29'))).toBe('scaduto');
  });
  it('revocato prevale sulla finestra', () => {
    expect(piTokenStato({ ...tok, revocato_at: at('2026-06-24') }, at('2026-06-25'))).toBe('revocato');
  });
});

describe('piTokenValido', () => {
  it('true solo dentro la finestra', () => {
    const tok = { valido_dal: '2026-06-22', valido_al: '2026-06-28' };
    expect(piTokenValido(tok, at('2026-06-25'))).toBe(true);
    expect(piTokenValido(tok, at('2026-06-29'))).toBe(false);
  });
});
