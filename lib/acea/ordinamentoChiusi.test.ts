// L'ordinamento della scheda «Chiusi» vive dentro la route, dove nessun test può chiamarlo: qui si
// presidia l'invariante che, se salta, non dà un errore in sviluppo ma spegne una schermata in
// produzione.
//
// `concluso_il` esiste SOLO sulla vista `acea_registro_massive`. Su `acea_ordini` e su
// `acqualatina_ordini` quella colonna non c'è, e ordinare per una colonna che non esiste fa
// fallire PostgREST: «Errore lettura registro» sull'intera famiglia. È la stessa cicatrice che
// `selezioneRegistro.ts` documenta per le colonne della select — due volte, con due migration
// arrivate in ritardo — e la guardia qui è la stessa: quella colonna si nomina solo dove la
// relazione è la vista.
//
// Il difetto che ha portato alla riga sorvegliata: su massive la scadenza è NULL su tutte le righe
// chiuse, quindi l'ordinamento canonico (scadenza crescente, poi data_creazione crescente) metteva
// in cima il più VECCHIO. Le 1.317 righe aperte a mano dal «+» sono le più recenti del registro e
// finivano dalla posizione 1.402 in giù, cioè oltre la quarta pagina da 300.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { relazioneRegistro } from './selezioneRegistro';
import { filtriVuoti, leggiFiltri, type FiltriOrdini } from './filtriOrdini';
import type { Famiglia } from './famiglia';

const ROUTE = readFileSync('app/api/acea/ordini/route.ts', 'utf8');

const f = (famiglia: Famiglia, stato: FiltriOrdini['stato']): FiltriOrdini => ({
  ...leggiFiltri(new URLSearchParams()),
  ...filtriVuoti(),
  famiglia,
  stato,
  entroGiorni: 7,
  pagina: 1,
  perPagina: 300,
  cerca: null,
  testi: leggiFiltri(new URLSearchParams()).testi,
});

/*
  Il sorgente SENZA COMMENTI: le guardie sono codice, e in questo file i commenti parlano molto —
  `concluso_il` è nominato tre volte nel commento che lo spiega. Cercarlo sul testo intero
  conterebbe le spiegazioni insieme all'istruzione.

  `[^:]` davanti a `//` per non mangiare gli `https://` degli URL nei commenti.
*/
const CODICE = ROUTE
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Gli usi di `concluso_il` nel codice della route. */
function usiNelCodice(): string[] {
  return CODICE.split('\n').filter((r) => r.includes('concluso_il')).map((r) => r.trim());
}

describe('ordinamento della scheda «Chiusi»', () => {
  it('la route ordina i chiusi massive per la data di conclusione, dal più recente', () => {
    const usi = usiNelCodice();
    expect(usi, 'nessun ordinamento per `concluso_il`: la scheda «Chiusi» delle massive è tornata a '
      + 'ordinare per scadenza, che su quelle righe è NULL ovunque — le righe dal «+» risprofondano '
      + 'oltre la quarta pagina').toHaveLength(1);
    expect(usi[0]).toContain('order');
    // Decrescente: è il senso della scheda. Crescente rimetterebbe in cima il lavoro più vecchio.
    expect(usi[0]).toContain('ascending: false');
  });

  it('`concluso_il` si nomina SOLO sotto una guardia su famiglia massive', () => {
    // La semplificazione tentante — «tanto vale per tutti i chiusi» — toglie la guardia e manda
    // giù il registro dunning, dove quella colonna non esiste.
    const posizione = CODICE.indexOf(usiNelCodice()[0]);
    const contesto = CODICE.slice(Math.max(0, posizione - 400), posizione);
    expect(contesto, 'l’ordinamento per `concluso_il` non è più protetto da una guardia sulla '
      + 'famiglia: su dunning e acqualatina quella colonna non esiste e la query fallisce')
      .toMatch(/f\.famiglia === 'massive'/);
    expect(contesto).toMatch(/f\.stato === 'chiusi'/);
  });

  it('la guardia combacia con la relazione che ha davvero quella colonna', () => {
    // `concluso_il` sta nella vista. Se un domani le massive tornassero a leggere `acea_ordini`,
    // questo test cade insieme alla premessa invece di lasciare la route a ordinare nel vuoto.
    expect(relazioneRegistro(f('massive', 'chiusi'))).toBe('acea_registro_massive');
    for (const fam of ['dunning', 'acqualatina'] as Famiglia[]) {
      expect(relazioneRegistro(f(fam, 'chiusi'))).not.toBe('acea_registro_massive');
    }
  });

  it('le altre schede non sono state toccate: ognuna tiene il suo criterio', () => {
    // Le riaperture ordinano per urgenza (aperte, la scadenza c'è); acqualatina segue la strada,
    // che è il giro dell'operatore. Restano dove sono.
    expect(ROUTE).toMatch(/f\.stato === 'riaperture'/);
    expect(ROUTE).toMatch(/f\.famiglia === 'acqualatina'/);
  });
});
