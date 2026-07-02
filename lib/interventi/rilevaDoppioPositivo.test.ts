import { describe, it, expect } from 'vitest';
import { rilevaDoppioPositivo } from './rilevaDoppioPositivo';

describe('rilevaDoppioPositivo', () => {
  it('nessun altro completato positivo → null (nessuna riconciliazione)', () => {
    expect(rilevaDoppioPositivo([])).toBeNull();
  });

  it('un altro completato positivo → riferisce quello', () => {
    const r = rilevaDoppioPositivo([{ id: 'altro-1', created_at: '2026-06-16T10:00:00Z' }]);
    expect(r).toEqual({ rifId: 'altro-1' });
  });

  it('più altri → riferisce il più vecchio (created_at minore), non l\'ultimo in ordine di arrivo', () => {
    const r = rilevaDoppioPositivo([
      { id: 'nuovo', created_at: '2026-06-18T10:00:00Z' },
      { id: 'originale', created_at: '2026-06-16T09:00:00Z' },
      { id: 'medio', created_at: '2026-06-17T09:00:00Z' },
    ]);
    expect(r).toEqual({ rifId: 'originale' });
  });
});
