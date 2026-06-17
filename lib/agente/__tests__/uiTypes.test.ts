import { describe, it, expect } from 'vitest';
import {
  GIORNI_LABEL,
  formattaContatto,
  formattaIstante,
  badgeModalita,
} from '@/lib/agente/uiTypes';

describe('uiTypes helpers', () => {
  it('GIORNI_LABEL ha 7 etichette Lun..Dom in ordine ISO', () => {
    expect(GIORNI_LABEL).toEqual(['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']);
  });

  it('formattaContatto: null → "mai"', () => {
    expect(formattaContatto(null)).toBe('mai');
  });

  it('formattaContatto: minuti → "N min fa"', () => {
    expect(formattaContatto(0)).toBe('adesso');
    expect(formattaContatto(5)).toBe('5 min fa');
    expect(formattaContatto(59)).toBe('59 min fa');
  });

  it('formattaContatto: ore intere', () => {
    expect(formattaContatto(60)).toBe('1 h fa');
    expect(formattaContatto(150)).toBe('2 h 30 min fa');
  });

  it('formattaContatto: oltre 24h → giorni', () => {
    expect(formattaContatto(60 * 26)).toBe('1 g 2 h fa');
  });

  it('formattaIstante: null → "—"', () => {
    expect(formattaIstante(null)).toBe('—');
  });

  it('formattaIstante: ISO → data/ora locale italiana', () => {
    const out = formattaIstante('2026-06-16T19:30:00.000Z');
    expect(out).toMatch(/16\/06\/2026/);
    expect(out).toMatch(/\d{2}:\d{2}/);
  });

  it('badgeModalita riflette dry_run', () => {
    expect(badgeModalita(true)).toEqual({ label: 'Prova', tono: 'prova' });
    expect(badgeModalita(false)).toEqual({ label: 'Reale', tono: 'reale' });
  });
});
