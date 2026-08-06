import { describe, it, expect } from 'vitest';
import { COLONNE, relazioneRegistro, selezioneRegistro } from './selezioneRegistro';
import { filtriVuoti, leggiFiltri, type FiltriOrdini } from './filtriOrdini';
import type { Famiglia } from './famiglia';

const f = (famiglia: Famiglia): FiltriOrdini => ({
  ...leggiFiltri(new URLSearchParams()),
  ...filtriVuoti(),
  famiglia,
  entroGiorni: 7,
  pagina: 1,
  perPagina: 300,
  cerca: null,
  testi: leggiFiltri(new URLSearchParams()).testi,
});

const campi = (s: string): string[] => s.split(',').map((c) => c.trim());

describe('selezioneRegistro', () => {
  /*
    Il difetto che questo test esiste per impedire, ed era in produzione.

    La rilettura della pagina dopo l'incrocio cerca le righe per `id`. `id` era nel `.in()` ma non
    nella `select`: la query partiva, le righe tornavano, e siccome nella risposta `id` non c'era,
    la mappa si costruiva con chiavi `undefined` e ogni riga della pagina veniva scartata. Il
    conteggio restava giusto — viene dalla scansione, non da qui — e la tabella usciva vuota con
    scritto «Nessun ordine con questi filtri»: indistinguibile da un filtro troppo stretto.
  */
  it('chiede SEMPRE l’id: è la chiave con cui la pagina si rilegge', () => {
    for (const fam of ['dunning', 'massive', 'acqualatina'] as Famiglia[]) {
      expect(campi(selezioneRegistro(f(fam)))).toContain('id');
    }
  });

  it('porta tutte le colonne della tabella, su ogni famiglia', () => {
    for (const fam of ['dunning', 'massive', 'acqualatina'] as Famiglia[]) {
      const presenti = new Set(campi(selezioneRegistro(f(fam))));
      for (const c of campi(COLONNE)) expect(presenti).toContain(c);
    }
  });

  /*
    Le due colonne della vista unificata esistono SOLO là. Chiederle su `acea_ordini` o su
    `acqualatina_ordini` non degrada una decorazione: fa fallire la query del registro, cioè la
    schermata. È già successo due volte con altre colonne (vedi la nota dentro `COLONNE`).
  */
  it('le colonne della vista massive non finiscono sulle altre famiglie', () => {
    const soloVista = ['intervento_id', 'sola_lettura'];
    const massive = campi(selezioneRegistro(f('massive')));
    for (const c of soloVista) expect(massive).toContain(c);

    for (const fam of ['dunning', 'acqualatina'] as Famiglia[]) {
      const altri = campi(selezioneRegistro(f(fam)));
      for (const c of soloVista) expect(altri).not.toContain(c);
    }
  });

  it('nessuna colonna chiesta due volte', () => {
    for (const fam of ['dunning', 'massive', 'acqualatina'] as Famiglia[]) {
      const c = campi(selezioneRegistro(f(fam)));
      expect(new Set(c).size).toBe(c.length);
    }
  });
});

describe('relazioneRegistro', () => {
  it('le massive si leggono dalla vista unificata', () => {
    // È l'unica che porta anche il lavoro fatto senza ordine: 1.317 interventi aperti a mano dal
    // «+», che su `acea_ordini` non possono esistere.
    expect(relazioneRegistro(f('massive'))).toBe('acea_registro_massive');
  });

  it('le altre famiglie restano sulla loro tabella', () => {
    expect(relazioneRegistro(f('dunning'))).toBe('acea_ordini');
    expect(relazioneRegistro(f('acqualatina'))).toBe('acqualatina_ordini');
  });

  /*
    La vista serve solo la LETTURA, e non deve diventare il bersaglio delle scritture: una vista
    con UNION non è aggiornabile, e pianificazione, appunti e celle salvano per (odl,
    numero_operazione) su `acea_ordini`. È il motivo per cui questa funzione esiste separata da
    `PROFILO_COMMESSA.tabellaOrdini`, che le scritture usano.
  */
  it('non è la stessa cosa della tabella su cui si scrive', () => {
    expect(relazioneRegistro(f('massive'))).not.toBe('acea_ordini');
  });
});
