import { describe, it, expect } from 'vitest';
import { usernameFromEmail } from './usernameFromEmail';

describe('usernameFromEmail', () => {
  it('estrae lo username dalla email locale standard', () => {
    expect(usernameFromEmail('u_francesco.marian@local.it')).toBe('francesco.marian');
    expect(usernameFromEmail('u_edgardo.perrelli@local.it')).toBe('edgardo.perrelli');
  });
  it('gestisce il dominio legacy @local', () => {
    expect(usernameFromEmail('u_mario@local')).toBe('mario');
  });
  it('normalizza maiuscole e spazi', () => {
    expect(usernameFromEmail('  U_Mario.Rossi@LOCAL.IT ')).toBe('mario.rossi');
  });
  it('senza prefisso u_ usa la parte locale', () => {
    expect(usernameFromEmail('mario@local.it')).toBe('mario');
  });
  it('stringa vuota se assente', () => {
    expect(usernameFromEmail(null)).toBe('');
    expect(usernameFromEmail(undefined)).toBe('');
    expect(usernameFromEmail('')).toBe('');
  });
});
