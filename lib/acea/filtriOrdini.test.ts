import { describe, it, expect } from 'vitest';
import {
  leggiFiltri, soglieScadenza, intervalloPagina, espressioneRicerca,
} from './filtriOrdini';

const q = (s: string) => leggiFiltri(new URLSearchParams(s));

describe('leggiFiltri', () => {
  it('senza parametri applica i default', () => {
    expect(q('')).toEqual({
      famiglia: null, stato: 'tutti', comune: null, attivita: null, operatore: null,
      scadenza: 'tutte', entroGiorni: 7, cerca: null, pagina: 1, perPagina: 100,
    });
  });

  it('legge i valori validi', () => {
    const f = q('famiglia=massive&stato=aperti&comune=ZAGAROLO&scadenza=scaduti&pagina=3&perPagina=50');
    expect(f).toMatchObject({
      famiglia: 'massive', stato: 'aperti', comune: 'ZAGAROLO', scadenza: 'scaduti',
      pagina: 3, perPagina: 50,
    });
  });

  it('un valore ignoto cade sul default invece di dare errore', () => {
    expect(q('famiglia=pippo').famiglia).toBeNull();
    expect(q('stato=boh').stato).toBe('tutti');
    expect(q('scadenza=domani').scadenza).toBe('tutte');
  });

  it('limita la paginazione entro valori sensati', () => {
    expect(q('perPagina=99999').perPagina).toBe(500);   // tetto
    expect(q('perPagina=0').perPagina).toBe(1);
    expect(q('perPagina=abc').perPagina).toBe(100);      // default
    expect(q('pagina=0').pagina).toBe(1);
    expect(q('entroGiorni=999').entroGiorni).toBe(60);
  });

  it('normalizza le stringhe vuote a null', () => {
    expect(q('comune=%20%20&cerca=').comune).toBeNull();
    expect(q('cerca=').cerca).toBeNull();
  });
});

describe('soglieScadenza', () => {
  it('scaduti = strettamente prima di oggi', () => {
    // Un ordine che scade OGGI non è ancora in ritardo: contarlo come scaduto farebbe
    // perdere fiducia nel numero.
    expect(soglieScadenza(q('scadenza=scaduti'), '2026-07-26'))
      .toEqual({ tipo: 'scaduti', prima: '2026-07-26' });
  });

  it('in scadenza = da oggi a oggi+N inclusi', () => {
    expect(soglieScadenza(q('scadenza=in_scadenza'), '2026-07-26'))
      .toEqual({ tipo: 'in_scadenza', da: '2026-07-26', a: '2026-08-02' });
    expect(soglieScadenza(q('scadenza=in_scadenza&entroGiorni=1'), '2026-07-26'))
      .toEqual({ tipo: 'in_scadenza', da: '2026-07-26', a: '2026-07-27' });
  });

  it('attraversa mesi e anni senza slittare di fuso', () => {
    expect(soglieScadenza(q('scadenza=in_scadenza&entroGiorni=10'), '2026-12-26'))
      .toEqual({ tipo: 'in_scadenza', da: '2026-12-26', a: '2027-01-05' });
    // passaggio all'ora legale: senza aritmetica UTC salterebbe un giorno
    expect(soglieScadenza(q('scadenza=in_scadenza&entroGiorni=2'), '2026-03-28'))
      .toEqual({ tipo: 'in_scadenza', da: '2026-03-28', a: '2026-03-30' });
  });

  it('senza scadenza è un filtro a sé (le massive)', () => {
    expect(soglieScadenza(q('scadenza=senza_scadenza'), '2026-07-26')).toEqual({ tipo: 'senza_scadenza' });
  });

  it('nessun filtro scadenza → nessuna soglia', () => {
    expect(soglieScadenza(q(''), '2026-07-26')).toEqual({ tipo: 'nessuna' });
  });

  it('una data odierna malformata non produce soglie sballate', () => {
    expect(soglieScadenza(q('scadenza=scaduti'), '26/07/2026')).toEqual({ tipo: 'nessuna' });
  });
});

describe('intervalloPagina', () => {
  it('la prima pagina parte da zero', () => {
    expect(intervalloPagina(q('perPagina=100'))).toEqual({ da: 0, a: 99 });
  });
  it('le pagine successive non si sovrappongono', () => {
    expect(intervalloPagina(q('pagina=2&perPagina=100'))).toEqual({ da: 100, a: 199 });
    expect(intervalloPagina(q('pagina=3&perPagina=50'))).toEqual({ da: 100, a: 149 });
  });
});

describe('espressioneRicerca', () => {
  it('cerca su ODL, matricola, impianto, indirizzo e testo ordine', () => {
    expect(espressioneRicerca(q('cerca=912215'))).toBe(
      'odl.ilike.*912215*,matricola_norm.ilike.*912215*,impianto.ilike.*912215*,via.ilike.*912215*,testo_ordine.ilike.*912215*',
    );
  });

  it('neutralizza i caratteri che spezzerebbero la sintassi di PostgREST', () => {
    // Virgole e parentesi nel termine cercato chiuderebbero l'espressione `or=(...)` e
    // cambierebbero la query: vengono sostituite con spazi prima di comporre il filtro.
    const e = espressioneRicerca(q('cerca=' + encodeURIComponent('a,b)c(*')));
    expect(e).toBe(
      'odl.ilike.*a b c*,matricola_norm.ilike.*a b c*,impianto.ilike.*a b c*,via.ilike.*a b c*,testo_ordine.ilike.*a b c*',
    );
    // il termine ripulito non contiene più caratteri di sintassi
    const termine = /odl\.ilike\.\*(.*?)\*,/.exec(e ?? '')?.[1] ?? '';
    expect(termine).not.toMatch(/[(),*]/);
  });

  it('null quando non c\'è nulla da cercare', () => {
    expect(espressioneRicerca(q(''))).toBeNull();
    expect(espressioneRicerca(q('cerca=' + encodeURIComponent('(),')))).toBeNull();
  });
});
