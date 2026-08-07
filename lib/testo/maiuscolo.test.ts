import { describe, it, expect } from 'vitest';
import { testoPulito } from './maiuscolo';

describe('testoPulito', () => {
  it('MAIUSCOLO, spazi doppi schiacciati, bordi tolti', () => {
    expect(testoPulito('  Sul  Posto ')).toBe('SUL POSTO');
    expect(testoPulito('Limitazione del flusso idrico')).toBe('LIMITAZIONE DEL FLUSSO IDRICO');
  });

  it('schiaccia anche le tabulazioni', () => {
    expect(testoPulito('VIA\tROMA\t\t12')).toBe('VIA ROMA 12');
  });

  /*
    Il caso che vale il test: 307 righe di `testo_ordine`/`testo_conferma` portano il testo di ACEA
    su più righe. Con `\s+` i newline sarebbero collassati e l'ordine diventerebbe un paragrafo
    unico — un danno irreversibile e invisibile finché qualcuno non rilegge quell'ordine.
  */
  it('TIENE gli a capo: il testo dell’ordine non si appiattisce', () => {
    expect(testoPulito('prima riga\nseconda  riga')).toBe('PRIMA RIGA\nSECONDA RIGA');
    expect(testoPulito('  a \n  b  ')).toBe('A \n B');
  });

  it('vuoto e soli spazi diventano null: una cella vuota resta vuota', () => {
    expect(testoPulito('')).toBeNull();
    expect(testoPulito('   ')).toBeNull();
    expect(testoPulito('\t \t')).toBeNull();
  });

  it('null e undefined passano indenni', () => {
    expect(testoPulito(null)).toBeNull();
    expect(testoPulito(undefined)).toBeNull();
  });

  it('quello che è già pulito non cambia', () => {
    expect(testoPulito('SOSTITUZIONE MISURATORE')).toBe('SOSTITUZIONE MISURATORE');
  });
});
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
  it("maiuscola anche i campi 'matricola': scanner e tastiera devono lasciare lo stesso codice", () => {
    const campiMatricola: TemplateCampo[] = [
      { chiave: 'matricola_nuova', etichetta: 'MATRICOLA NUOVO MISURATORE', tipo: 'matricola', ordine: 1 },
    ];
    expect(maiuscolaRisposteTesto({ matricola_nuova: 'al26a0012345' }, campiMatricola)).toEqual({
      matricola_nuova: 'AL26A0012345',
    });
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
