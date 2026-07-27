import { describe, it, expect } from 'vitest';
import { calibroConDefault, isAcqualatina, CALIBRO_DEFAULT } from './contratto';

describe('calibroConDefault', () => {
  it('tiene il calibro indicato dall\'ufficio', () => {
    expect(calibroConDefault('DN20')).toBe('DN20');
    expect(calibroConDefault('  DN25  ')).toBe('DN25');
  });

  it('cella vuota/assente → default di capitolato DN15', () => {
    expect(calibroConDefault('')).toBe(CALIBRO_DEFAULT);
    expect(calibroConDefault('   ')).toBe(CALIBRO_DEFAULT);
    expect(calibroConDefault(null)).toBe(CALIBRO_DEFAULT);
    expect(calibroConDefault(undefined)).toBe(CALIBRO_DEFAULT);
  });
});

describe('isAcqualatina', () => {
  it('riconosce il committente a prescindere da case e spazi', () => {
    expect(isAcqualatina('acqualatina')).toBe(true);
    expect(isAcqualatina('  AcquaLatina ')).toBe(true);
  });

  it('gli altri committenti restano fuori', () => {
    for (const c of ['acea', 'italgas', 'altro', 'lim_massive', '', null, undefined]) {
      expect(isAcqualatina(c)).toBe(false);
    }
  });
});
