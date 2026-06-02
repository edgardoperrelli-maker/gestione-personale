import { describe, it, expect } from 'vitest';
import { statoDaRisultatoGeocode, formatGeocodeProgress } from './geocodeStatus';

describe('statoDaRisultatoGeocode', () => {
  it("torna 'ok' con coordinate valide", () => {
    expect(statoDaRisultatoGeocode({ lat: 41.9, lng: 12.5 })).toBe('ok');
  });
  it("torna 'failed' con null", () => {
    expect(statoDaRisultatoGeocode(null)).toBe('failed');
  });
});

describe('formatGeocodeProgress', () => {
  it('riepiloga ok/da correggere/rimasti', () => {
    expect(formatGeocodeProgress({ processati: 10, ok: 8, falliti: 2, restanti: 5 }))
      .toBe('8 ok, 2 da correggere · 5 rimasti');
  });
  it('gestisce lo zero', () => {
    expect(formatGeocodeProgress({ processati: 0, ok: 0, falliti: 0, restanti: 0 }))
      .toBe('0 ok, 0 da correggere · 0 rimasti');
  });
});
