import { describe, it, expect } from 'vitest';
import { etichettaCommittente } from './etichettaCommittente';

describe('etichettaCommittente', () => {
  it('mappa i valori noti', () => {
    expect(etichettaCommittente('acea')).toBe('Acea');
    expect(etichettaCommittente('italgas')).toBe('Italgas');
    expect(etichettaCommittente('altro')).toBe('Altro');
    expect(etichettaCommittente('lim_massive')).toBe('Limitazioni massive');
  });
  it('fallback al valore grezzo se sconosciuto', () => {
    expect(etichettaCommittente('xxx')).toBe('xxx');
    expect(etichettaCommittente(null)).toBe('');
  });
});
