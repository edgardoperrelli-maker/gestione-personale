import { describe, it, expect } from 'vitest';
import { isValidElement } from 'react';
import { MODULE_ICONS } from '@/components/layout/moduleIcons';
import { ALL_MODULE_KEYS } from '@/lib/moduleAccess';

describe('MODULE_ICONS', () => {
  it('ha una voce per agente', () => {
    expect(MODULE_ICONS.agente).toBeDefined();
    expect(isValidElement(MODULE_ICONS.agente)).toBe(true);
  });

  it('copre TUTTE le chiavi modulo (record esaustivo)', () => {
    for (const key of ALL_MODULE_KEYS) {
      expect(MODULE_ICONS[key], `manca icona per ${key}`).toBeDefined();
    }
  });
});
