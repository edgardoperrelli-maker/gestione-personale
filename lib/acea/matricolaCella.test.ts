import { describe, expect, it } from 'vitest';
import {
  eConflittoUnicita,
  motivoMatricolaDuplicata,
  patchRegistroMatricola,
  valoreMatricolaCella,
} from './matricolaCella';

describe('valoreMatricolaCella', () => {
  it('porta in MAIUSCOLO e calcola il normalizzato', () => {
    expect(valoreMatricolaCella('i15ba041721')).toEqual({
      ok: true, matricola: 'I15BA041721', norm: 'I15BA041721',
    });
  });

  /*
    Il normalizzato butta via i separatori, la matricola SCRITTA no: a schermo e sul misuratore
    il trattino c'è, ed è quello che l'ufficio detta al telefono. Sono due valori diversi con
    due lavori diversi, e confonderli farebbe divergere cella e indice unico.
  */
  it('tiene i separatori nella matricola e li toglie solo dal normalizzato', () => {
    expect(valoreMatricolaCella('SETA-07/12 240')).toEqual({
      ok: true, matricola: 'SETA-07/12 240', norm: 'SETA0712240',
    });
  });

  it('il VUOTO si rifiuta: è l’identità della riga, non un campo facoltativo', () => {
    for (const v of ['', '   ', null, undefined]) {
      const esito = valoreMatricolaCella(v);
      expect(esito.ok).toBe(false);
      if (!esito.ok) expect(esito.motivo).toContain('non si può svuotare');
    }
  });

  it('rifiuta un valore che non lascia niente di identificabile', () => {
    const esito = valoreMatricolaCella('---');
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.motivo).toContain('non è una matricola');
  });

  it('taglia alla lunghezza massima invece di rifiutare', () => {
    const esito = valoreMatricolaCella('A'.repeat(200));
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.matricola.length).toBe(60);
  });
});

describe('patchRegistroMatricola', () => {
  /*
    Le due colonne viaggiano SEMPRE insieme: `matricola_norm` è la metà su cui vive l'indice
    unico `(odl, matricola_norm)` e su cui si aggancia l'intervento. Scriverne una sola
    lascerebbe la riga con due verità e nessun errore che lo dica.
  */
  it('scrive matricola e normalizzata insieme', () => {
    const patch = patchRegistroMatricola({ matricola: 'I15BA041721', norm: 'I15BA041721' });
    expect(patch.matricola).toBe('I15BA041721');
    expect(patch.matricola_norm).toBe('I15BA041721');
  });

  /*
    Il triangolo «matricola quasi certamente incompleta» si spegne: una volta scritto il dato
    vero a mano, quell'avviso diventerebbe una bugia che nessun import può più togliere — la
    cifra mancante non sta in nessun file che riceviamo.
  */
  it('spegne il sospetto di troncamento', () => {
    expect(patchRegistroMatricola({ matricola: 'X1', norm: 'X1' }).sospetto_troncamento).toBe(false);
  });
});

describe('eConflittoUnicita', () => {
  it('riconosce la violazione di unicità (23505), che è una risposta e non un guasto', () => {
    expect(eConflittoUnicita({ code: '23505', message: 'duplicate key' })).toBe(true);
  });

  it('lascia passare tutto il resto: un guasto vero deve restare un guasto', () => {
    expect(eConflittoUnicita({ code: '42703' })).toBe(false);
    expect(eConflittoUnicita(new Error('boom'))).toBe(false);
    expect(eConflittoUnicita(null)).toBe(false);
    expect(eConflittoUnicita(undefined)).toBe(false);
  });
});

describe('motivoMatricolaDuplicata', () => {
  it('dice quale matricola e perché, non «errore»', () => {
    const motivo = motivoMatricolaDuplicata('I15BA041721');
    expect(motivo).toContain('I15BA041721');
    expect(motivo).toContain('già presente su questo ODL');
  });
});
