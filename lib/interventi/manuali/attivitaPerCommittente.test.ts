import { describe, it, expect } from 'vitest';
import { attivitaDefaultManuale } from './attivitaPerCommittente';

describe('attivitaDefaultManuale', () => {
  it('lim_massive → LIMITAZIONI MASSIVE', () => {
    expect(attivitaDefaultManuale('lim_massive')).toBe('LIMITAZIONI MASSIVE');
  });
  it('altri committenti → undefined (il personale la sceglie)', () => {
    expect(attivitaDefaultManuale('acea')).toBeUndefined();
    expect(attivitaDefaultManuale('italgas')).toBeUndefined();
    expect(attivitaDefaultManuale('altro')).toBeUndefined();
  });
});
