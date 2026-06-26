import { describe, it, expect } from 'vitest';
import { reperibiliPerData, isReperibile, calcolaAnomaliaReperibilita } from './reperibili';

describe('reperibiliPerData', () => {
  it('raggruppa per data e deduplica per staff', () => {
    const m = reperibiliPerData([
      { data: '2026-06-25', staff_id: 's1', staff_name: 'Napoleoni' },
      { data: '2026-06-25', staff_id: 's1', staff_name: 'Napoleoni' }, // dup
      { data: '2026-06-25', staff_id: 's2', staff_name: 'Macchia' },
      { data: '2026-06-26', staff_id: 's3', staff_name: 'Cruciani' },
    ]);
    expect(m['2026-06-25'].map((r) => r.staffId)).toEqual(['s1', 's2']);
    expect(m['2026-06-26']).toHaveLength(1);
  });
  it('scarta righe senza data/staff e usa staffId come nome di fallback', () => {
    const m = reperibiliPerData([
      { data: '', staff_id: 's1', staff_name: 'x' },
      { data: '2026-06-25', staff_id: 's9', staff_name: null },
    ]);
    expect(m['']).toBeUndefined();
    expect(m['2026-06-25'][0].nome).toBe('s9');
  });
});

describe('calcolaAnomaliaReperibilita', () => {
  const mappa = reperibiliPerData([
    { data: '2026-06-25', staff_id: 's1', staff_name: 'Napoleoni' },
  ]);
  it('nessuna anomalia se reperibile in quella data', () => {
    expect(isReperibile('s1', '2026-06-25', mappa)).toBe(true);
    expect(calcolaAnomaliaReperibilita('s1', '2026-06-25', mappa)).toBe(false);
  });
  it('anomalia se non reperibile in quella data (chiamata retrodatata)', () => {
    expect(calcolaAnomaliaReperibilita('s1', '2026-06-24', mappa)).toBe(true);
  });
  it('anomalia se nessun reperibile / input mancante', () => {
    expect(calcolaAnomaliaReperibilita('s2', '2026-06-25', mappa)).toBe(true);
    expect(calcolaAnomaliaReperibilita('', '2026-06-25', mappa)).toBe(true);
  });
});
