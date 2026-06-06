import { describe, it, expect } from 'vitest';
import { badgeVoceManuale } from './badgeVoce';

describe('badgeVoceManuale', () => {
  it('in_attesa → badge Sospeso + bloccata', () => {
    expect(badgeVoceManuale('in_attesa')).toEqual({ label: '⏳ Sospeso', tono: 'attesa', bloccata: true });
  });
  it('rifiutato → badge Rifiutato, non bloccata', () => {
    expect(badgeVoceManuale('rifiutato')).toEqual({ label: '✗ Rifiutato', tono: 'rifiutato', bloccata: false });
  });
  it('approvato → nessun badge, non bloccata', () => {
    expect(badgeVoceManuale('approvato')).toBeNull();
  });
  it('null (voce normale) → nessun badge', () => {
    expect(badgeVoceManuale(null)).toBeNull();
  });
});
