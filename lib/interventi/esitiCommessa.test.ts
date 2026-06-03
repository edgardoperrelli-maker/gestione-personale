import { describe, it, expect } from 'vitest';
import { esitiPerCommessa } from './esitiCommessa';

describe('esitiPerCommessa', () => {
  it('acea: ok=eseguito_positivo + le 5 causali Acea', () => {
    const r = esitiPerCommessa('acea');
    expect(r.ok.chiave).toBe('eseguito_positivo');
    expect(r.causali.map((c) => c.chiave)).toEqual([
      'accesso_negato',
      'contatore_non_trovato',
      'dati_ubicazione_insufficienti',
      'accesso_a_vuoto',
      'rinviato',
    ]);
  });

  it("l'ok non richiede motivo; le causali sì", () => {
    const r = esitiPerCommessa('acea');
    expect(r.ok.richiedeMotivo).toBe(false);
    expect(r.causali.every((c) => c.richiedeMotivo)).toBe(true);
  });

  it('italgas: set ridotto di default', () => {
    const r = esitiPerCommessa('italgas');
    expect(r.causali.map((c) => c.chiave)).toEqual([
      'accesso_negato',
      'accesso_a_vuoto',
      'rinviato',
    ]);
  });

  it('committente sconosciuto/assente → fallback al default', () => {
    expect(esitiPerCommessa('sconosciuto').ok.chiave).toBe('eseguito_positivo');
    expect(esitiPerCommessa(null).causali.length).toBeGreaterThan(0);
    expect(esitiPerCommessa(undefined).causali.length).toBeGreaterThan(0);
  });

  it('case-insensitive sul committente', () => {
    expect(esitiPerCommessa('ACEA').causali).toHaveLength(5);
  });

  it('ogni esito ha etichetta non vuota', () => {
    const r = esitiPerCommessa('acea');
    expect([r.ok, ...r.causali].every((c) => c.etichetta.trim().length > 0)).toBe(true);
  });
});
