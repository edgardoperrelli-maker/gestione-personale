// tools/limitazioni-sync/lib/finestra.test.ts
import { describe, it, expect } from 'vitest';
import { finestra } from './finestra.mjs';

describe('finestra', () => {
  it('15 giorni inclusivi terminanti oggi', () => {
    expect(finestra('2026-06-16', 15)).toEqual({ from: '2026-06-02', to: '2026-06-16' });
  });
  it('finestra di 1 giorno = solo oggi', () => {
    expect(finestra('2026-06-16', 1)).toEqual({ from: '2026-06-16', to: '2026-06-16' });
  });
});
