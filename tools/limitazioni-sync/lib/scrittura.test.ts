// tools/limitazioni-sync/lib/scrittura.test.ts
import { describe, it, expect } from 'vitest';
import { decidiScrittura } from './scrittura.mjs';

describe('decidiScrittura', () => {
  it('valore nuovo vuoto → salta', () => {
    expect(decidiScrittura('x', '')).toEqual({ azione: 'salta', valore: '' });
    expect(decidiScrittura(null, null)).toEqual({ azione: 'salta', valore: '' });
  });
  it('cella vuota → scrivi', () => {
    expect(decidiScrittura(null, 'eseguito')).toEqual({ azione: 'scrivi', valore: 'eseguito' });
    expect(decidiScrittura('   ', 'AA1')).toEqual({ azione: 'scrivi', valore: 'AA1' });
  });
  it('cella uguale → salta', () => {
    expect(decidiScrittura('eseguito', 'eseguito')).toEqual({ azione: 'salta', valore: 'eseguito' });
  });
  it('cella diversa già scritta a mano → conflitto (non sovrascrive)', () => {
    expect(decidiScrittura('No', 'eseguito')).toEqual({
      azione: 'conflitto', valore: 'eseguito', esistente: 'No',
    });
  });
});
