import { describe, it, expect } from 'vitest';
import { mapsUrlFromCoordinate, mapsUrlFromAddress } from './mapsLink';

describe('mapsUrlFromCoordinate', () => {
  it('punto esatto: rimuove spazi e codifica la virgola', () => {
    expect(mapsUrlFromCoordinate('41.853675, 12.7888783'))
      .toBe('https://www.google.com/maps/search/?api=1&query=41.853675%2C12.7888783');
  });
});

describe('mapsUrlFromAddress', () => {
  it('compone via + cap + comune e codifica', () => {
    expect(mapsUrlFromAddress('Via Cancellata Grande 18', 'Zagarolo', '00039'))
      .toBe('https://www.google.com/maps/search/?api=1&query=Via%20Cancellata%20Grande%2018%2000039%20Zagarolo');
  });
  it('ignora i pezzi mancanti', () => {
    expect(mapsUrlFromAddress('Via Roma 1', null, undefined))
      .toBe('https://www.google.com/maps/search/?api=1&query=Via%20Roma%201');
  });
});
