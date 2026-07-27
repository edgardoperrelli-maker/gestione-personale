import { describe, it, expect } from 'vitest';
import { VISTE, ORDINE_VISTE, altreViste } from './viste';

describe('viste del modulo Contratti', () => {
  it('ogni vista ha una route figlia sotto il modulo', () => {
    for (const v of ORDINE_VISTE) {
      expect(VISTE[v].href).toBe(`/impostazioni/contratti/${v}`);
      expect(VISTE[v].titolo.trim()).not.toBe('');
      expect(VISTE[v].desc.trim()).not.toBe('');
    }
  });

  it('il rientro laterale mostra le altre due viste, mai la corrente', () => {
    for (const v of ORDINE_VISTE) {
      const altre = altreViste(v);
      expect(altre).toHaveLength(2);
      expect(altre.map((a) => a.href)).not.toContain(VISTE[v].href);
    }
  });

  it("conserva l'ordine di modulo: anagrafica → economico → operativo", () => {
    expect(ORDINE_VISTE).toEqual(['commesse', 'prezzi', 'attivita']);
    // Da «prezzi» il rientro resta nell'ordine di modulo, non nell'ordine di visita.
    expect(altreViste('prezzi').map((a) => a.titolo)).toEqual(['Commesse', 'Attività']);
  });
});
