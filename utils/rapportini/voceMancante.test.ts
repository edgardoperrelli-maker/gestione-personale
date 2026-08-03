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
  it('NESSUN PASSAGGIO → null: niente nota_mancante (nota non obbligatoria, non blocca l\'invio)', () => {
    const conEseguito: TemplateCampo[] = [
      { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NESSUN PASSAGGIO', 'NO'], ordine: 1 },
      { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 2 },
    ];
    expect(motivoVoceIncompleta({ eseguito: 'NESSUN PASSAGGIO' }, conEseguito)).toBeNull();
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

describe('matricola obbligatoria mancante', () => {
  const acqualatina: TemplateCampo[] = [
    { chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'NO'], obbligatoria: true, ordine: 1 },
    { chiave: 'matricola_nuova', etichetta: 'MATRICOLA NUOVO MISURATORE', tipo: 'matricola', obbligatoria: true, ordine: 2 },
    { chiave: 'note', etichetta: 'NOTE', tipo: 'testo', ordine: 3 },
  ];

  it('esito positivo con la matricola vuota → matricola_mancante, NON senza_esito', () => {
    // È la ragione per cui il motivo esiste: l'esito c'è, e dire «senza esito» manderebbe
    // l'operatore a cercare il campo sbagliato mentre è ancora davanti all'impianto.
    expect(motivoVoceIncompleta({ eseguito: 'SI' }, acqualatina)).toBe('matricola_mancante');
  });

  it('con la matricola → null (completa)', () => {
    expect(motivoVoceIncompleta({ eseguito: 'SI', matricola_nuova: 'AL26A0012345' }, acqualatina)).toBeNull();
  });

  it('voce ancora intonsa → senza_esito, come prima', () => {
    expect(motivoVoceIncompleta({}, acqualatina)).toBe('senza_esito');
  });

  it('esito negativo → nota_mancante: la matricola non c\'entra', () => {
    expect(motivoVoceIncompleta({ eseguito: 'NO' }, acqualatina)).toBe('nota_mancante');
    expect(motivoVoceIncompleta({ eseguito: 'NO', note: 'UTENTE ASSENTE' }, acqualatina)).toBeNull();
  });
});
