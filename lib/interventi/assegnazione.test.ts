import { describe, it, expect } from 'vitest';
import { pianificaAssegnazione } from './assegnazione';

describe('pianificaAssegnazione', () => {
  it('da_assegnare + operatore → assegnato, assegnatoAt set', () => {
    expect(pianificaAssegnazione('da_assegnare', 's1')).toEqual({
      ok: true, patch: { staff_id: 's1', stato: 'assegnato', assegnatoAt: 'set', azzeraAvvio: false },
    });
  });
  it('assegnato + altro operatore → riassegna, assegnatoAt keep', () => {
    expect(pianificaAssegnazione('assegnato', 's2')).toEqual({
      ok: true, patch: { staff_id: 's2', stato: 'assegnato', assegnatoAt: 'keep', azzeraAvvio: false },
    });
  });
  it('stato avviato + operatore → reset ad assegnato con azzeraAvvio', () => {
    expect(pianificaAssegnazione('in_esecuzione', 's3')).toEqual({
      ok: true, patch: { staff_id: 's3', stato: 'assegnato', assegnatoAt: 'keep', azzeraAvvio: true },
    });
  });
  it('assegnato + nessuno → disassegna (clear)', () => {
    expect(pianificaAssegnazione('assegnato', null)).toEqual({
      ok: true, patch: { staff_id: null, stato: 'da_assegnare', assegnatoAt: 'clear', azzeraAvvio: false },
    });
  });
  it('da_assegnare + nessuno → no-op', () => {
    expect(pianificaAssegnazione('da_assegnare', null)).toEqual({
      ok: true, patch: { staff_id: null, stato: 'da_assegnare', assegnatoAt: 'keep', azzeraAvvio: false },
    });
  });
  it('avviato + nessuno → disassegna con azzeraAvvio', () => {
    expect(pianificaAssegnazione('in_viaggio', null)).toEqual({
      ok: true, patch: { staff_id: null, stato: 'da_assegnare', assegnatoAt: 'clear', azzeraAvvio: true },
    });
  });
  it('completato → rifiuto', () => {
    expect(pianificaAssegnazione('completato', 's1').ok).toBe(false);
  });
  it('annullato → rifiuto', () => {
    expect(pianificaAssegnazione('annullato', null).ok).toBe(false);
  });
});
