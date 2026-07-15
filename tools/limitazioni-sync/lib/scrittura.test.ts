// tools/limitazioni-sync/lib/scrittura.test.ts
import { describe, it, expect } from 'vitest';
import { decidiScrittura, cellaEsitoNegativa, cellaEsitoDaSovrascrivere } from './scrittura.mjs';

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

describe('cellaEsitoDaSovrascrivere', () => {
  it('vero su qualsiasi testo non-positivo (il positivo sovrascrive sempre)', () => {
    expect(cellaEsitoDaSovrascrivere('No', 'eseguito')).toBe(true);
    expect(cellaEsitoDaSovrascrivere('NO PASSAGGIO', 'eseguito')).toBe(true);
    expect(cellaEsitoDaSovrascrivere('annullato', 'eseguito')).toBe(true);
  });
  it('falso quando la cella è vuota (resta la policy riempi-vuote) o è già il positivo', () => {
    expect(cellaEsitoDaSovrascrivere('', 'eseguito')).toBe(false);
    expect(cellaEsitoDaSovrascrivere(null, 'eseguito')).toBe(false);
    expect(cellaEsitoDaSovrascrivere('eseguito', 'eseguito')).toBe(false);
    expect(cellaEsitoDaSovrascrivere(' ESEGUITO ', 'eseguito')).toBe(false);
  });
  it('falso se il testo positivo non è definito', () => {
    expect(cellaEsitoDaSovrascrivere('No', '')).toBe(false);
    expect(cellaEsitoDaSovrascrivere('No', null)).toBe(false);
  });
});

describe('cellaEsitoNegativa', () => {
  it('riconosce il testo negativo (case/spazi-insensibile)', () => {
    expect(cellaEsitoNegativa('No', 'No')).toBe(true);
    expect(cellaEsitoNegativa(' no ', 'No')).toBe(true);
    expect(cellaEsitoNegativa('NO', 'No')).toBe(true);
  });
  it('falso quando la cella ha il positivo o è vuota', () => {
    expect(cellaEsitoNegativa('eseguito', 'No')).toBe(false);
    expect(cellaEsitoNegativa('', 'No')).toBe(false);
    expect(cellaEsitoNegativa(null, 'No')).toBe(false);
  });
  it('falso se il testo negativo non è definito', () => {
    expect(cellaEsitoNegativa('No', '')).toBe(false);
    expect(cellaEsitoNegativa('No', null)).toBe(false);
  });
});
