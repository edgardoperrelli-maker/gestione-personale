import { describe, it, expect } from 'vitest';
import { motivoVoceIncompleta, isCampoNota } from './voceMancante';
import type { TemplateCampo } from './buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'att_cess', etichetta: 'ATT/CESS', tipo: 'crocetta', ordine: 1 },
  { chiave: 'assente', etichetta: 'ASSENTE', tipo: 'crocetta', ordine: 2 },
  { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 3 },
];

describe('motivoVoceIncompleta', () => {
  it('esito negativo senza nota → nota_mancante', () => {
    expect(motivoVoceIncompleta({ assente: true }, campi)).toBe('nota_mancante');
  });
  it('esito negativo con nota → null (completa)', () => {
    expect(motivoVoceIncompleta({ assente: true, note: 'non trovato' }, campi)).toBeNull();
  });
  it('nessun esito → senza_esito', () => {
    expect(motivoVoceIncompleta({}, campi)).toBe('senza_esito');
    expect(motivoVoceIncompleta({ note: 'x' }, campi)).toBe('senza_esito');
  });
  it('esito positivo → null (completa)', () => {
    expect(motivoVoceIncompleta({ att_cess: true }, campi)).toBeNull();
  });
});

describe('isCampoNota', () => {
  it('campo testo che inizia per "note" → true', () => {
    expect(isCampoNota({ chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 3 })).toBe(true);
  });
  it('campo testo non-note → false', () => {
    expect(isCampoNota({ chiave: 'descr', etichetta: 'Descrizione', tipo: 'testo', ordine: 1 })).toBe(false);
  });
  it('crocetta chiamata "note" → false (non è testo)', () => {
    expect(isCampoNota({ chiave: 'note', etichetta: 'Note', tipo: 'crocetta', ordine: 1 })).toBe(false);
  });
});
