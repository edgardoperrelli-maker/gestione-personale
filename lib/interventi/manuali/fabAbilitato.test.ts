import { describe, it, expect } from 'vitest';
import { fabAbilitato } from './fabAbilitato';

describe('fabAbilitato', () => {
  it('rapportino modificabile → abilitato', () => {
    expect(fabAbilitato({ readOnly: false, bloccato: false, inviato: false })).toBe(true);
  });
  it('readOnly → disabilitato', () => {
    expect(fabAbilitato({ readOnly: true, bloccato: false, inviato: false })).toBe(false);
  });
  it('bloccato (409) → disabilitato', () => {
    expect(fabAbilitato({ readOnly: false, bloccato: true, inviato: false })).toBe(false);
  });
  it('inviato → disabilitato', () => {
    expect(fabAbilitato({ readOnly: false, bloccato: false, inviato: true })).toBe(false);
  });
});
