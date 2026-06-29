import { describe, it, expect } from 'vitest';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { maiuscolo, maiuscolaStringhe, maiuscolaRisposteTesto, maiuscolaEtichette, maiuscoloDigitando } from './maiuscolo';

describe('maiuscolo', () => {
  it('porta in MAIUSCOLO le stringhe', () => {
    expect(maiuscolo('mario rossi')).toBe('MARIO ROSSI');
  });
  it('preserva accenti e cifre', () => {
    expect(maiuscolo('città è così 12a')).toBe('CITTÀ È COSÌ 12A');
  });
  it('lascia invariati i valori non-stringa', () => {
    expect(maiuscolo(42)).toBe(42);
    expect(maiuscolo(true)).toBe(true);
    expect(maiuscolo(null)).toBe(null);
    expect(maiuscolo(undefined)).toBe(undefined);
  });
});

describe('maiuscoloDigitando', () => {
  it('maiuscola fuori composizione IME', () => {
    expect(maiuscoloDigitando({ target: { value: 'via roma' }, nativeEvent: { isComposing: false } })).toBe('VIA ROMA');
  });
  it('NON maiuscola durante la composizione IME (Android: lo spazio cancellerebbe il campo)', () => {
    expect(maiuscoloDigitando({ target: { value: 'via' }, nativeEvent: { isComposing: true } })).toBe('via');
  });
  it('maiuscola quando isComposing è assente (incolla/autofill/PC)', () => {
    expect(maiuscoloDigitando({ target: { value: 'via' }, nativeEvent: {} })).toBe('VIA');
    expect(maiuscoloDigitando({ target: { value: 'via' }, nativeEvent: null })).toBe('VIA');
  });
});

describe('maiuscolaStringhe', () => {
  it('porta in MAIUSCOLO tutti i valori stringa di primo livello', () => {
    expect(maiuscolaStringhe({ nominativo: 'mario', via: 'via roma', cap: '00100' }))
      .toEqual({ nominativo: 'MARIO', via: 'VIA ROMA', cap: '00100' });
  });
  it('lascia intatti numeri/booleani/null e gestisce null/undefined', () => {
    expect(maiuscolaStringhe({ a: 'x', n: 3, b: true, z: null })).toEqual({ a: 'X', n: 3, b: true, z: null });
    expect(maiuscolaStringhe(null)).toEqual({});
    expect(maiuscolaStringhe(undefined)).toEqual({});
  });
  it("non muta l'oggetto originale", () => {
    const orig = { v: 'low' };
    maiuscolaStringhe(orig);
    expect(orig.v).toBe('low');
  });
});

describe('maiuscolaRisposteTesto', () => {
  const campi: TemplateCampo[] = [
    { chiave: 'note', etichetta: 'Note', tipo: 'testo', ordine: 1 },
    { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 2 },
    { chiave: 'qta', etichetta: 'Quantità', tipo: 'numero', ordine: 3 },
    { chiave: 'fatto', etichetta: 'Fatto', tipo: 'crocetta', ordine: 4 },
    { chiave: 'foto1', etichetta: 'Foto', tipo: 'foto', ordine: 5 },
  ];
  it('maiuscola SOLO i campi di testo, lascia intatti gli altri', () => {
    const r = maiuscolaRisposteTesto(
      { note: 'tutto ok', eseguito: 'si', qta: 3, fatto: true, foto1: 'rapportini/r1/AbC.jpg' },
      campi,
    );
    expect(r.note).toBe('TUTTO OK');
    expect(r.eseguito).toBe('si'); // select: opzione fissa, non toccata
    expect(r.qta).toBe(3); // numero intatto
    expect(r.fatto).toBe(true); // crocetta intatta
    expect(r.foto1).toBe('rapportini/r1/AbC.jpg'); // percorso foto case-sensitive intatto
  });
  it('senza campi testo ritorna copia invariata', () => {
    expect(maiuscolaRisposteTesto({ eseguito: 'si' }, campi.filter((c) => c.tipo !== 'testo'))).toEqual({ eseguito: 'si' });
  });
  it('gestisce risposte/campi null', () => {
    expect(maiuscolaRisposteTesto(null, null)).toEqual({});
  });
  it("non muta l'oggetto originale", () => {
    const orig = { note: 'x' };
    maiuscolaRisposteTesto(orig, campi);
    expect(orig.note).toBe('x');
  });
});

describe('maiuscolaEtichette', () => {
  it('porta in MAIUSCOLO solo etichetta, lascia chiave/tipo/opzioni intatti', () => {
    const campi = [
      { chiave: 'sost_valvola', etichetta: 'Sost. Valvola', tipo: 'foto', ordine: 1 },
      { chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'select', opzioni: ['SI', 'No'], ordine: 2 },
    ];
    expect(maiuscolaEtichette(campi)).toEqual([
      { chiave: 'sost_valvola', etichetta: 'SOST. VALVOLA', tipo: 'foto', ordine: 1 },
      { chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'No'], ordine: 2 },
    ]);
  });
  it('gestisce lista null/vuota e voci senza etichetta', () => {
    expect(maiuscolaEtichette(null)).toEqual([]);
    const senzaEtichetta: Array<{ chiave: string; etichetta?: unknown }> = [{ chiave: 'x' }];
    expect(maiuscolaEtichette(senzaEtichetta)).toEqual([{ chiave: 'x' }]);
  });
});
