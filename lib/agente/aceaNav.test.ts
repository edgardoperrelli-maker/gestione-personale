import { describe, it, expect } from 'vitest';
import { breadcrumbSegments } from './aceaNav';

describe('breadcrumbSegments', () => {
  it('root → vuoto', () => {
    expect(breadcrumbSegments({ commessa: null, attivita: null, azione: null })).toEqual([]);
  });
  it('commessa+attivita+azione → 3 segmenti con label', () => {
    const s = breadcrumbSegments({ commessa: 'acea', attivita: 'lm', azione: 'assegna' });
    expect(s.map((x) => x.label)).toEqual(['ACEA', 'Limitazioni massive', 'Assegna ODL']);
    expect(s.map((x) => x.level)).toEqual(['commessa', 'attivita', 'azione']);
  });
});
