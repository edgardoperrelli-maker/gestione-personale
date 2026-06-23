import { describe, it, expect } from 'vitest';
import { statoAttesa } from './attesaAgente';

const now = Date.parse('2026-06-23T10:00:00Z');
const minFa = (m: number) => now - m * 60_000;

describe('statoAttesa', () => {
  it('non in attesa → idle', () => {
    expect(statoAttesa(false, minFa(5), now, 12)).toEqual({ stato: 'idle', minuti: null });
  });
  it('in attesa senza dispatchedAt → attesa, minuti null', () => {
    expect(statoAttesa(true, null, now, 12)).toEqual({ stato: 'attesa', minuti: null });
  });
  it('in attesa da pochi minuti → attesa con minuti', () => {
    expect(statoAttesa(true, minFa(3), now, 12)).toEqual({ stato: 'attesa', minuti: 3 });
  });
  it('oltre la soglia → stallo', () => {
    expect(statoAttesa(true, minFa(12), now, 12)).toEqual({ stato: 'stallo', minuti: 12 });
    expect(statoAttesa(true, minFa(20), now, 12).stato).toBe('stallo');
  });
  it('soglia null (azione lunga) → mai stallo', () => {
    expect(statoAttesa(true, minFa(40), now, null)).toEqual({ stato: 'attesa', minuti: 40 });
  });
  it('dispatchedAt nel futuro → minuti 0', () => {
    expect(statoAttesa(true, minFa(-5), now, 12)).toEqual({ stato: 'attesa', minuti: 0 });
  });
});
