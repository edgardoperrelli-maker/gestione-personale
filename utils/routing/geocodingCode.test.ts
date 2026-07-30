import { describe, expect, it } from 'vitest';
import { inCoda } from './geocodingCore';

/*
  Le code di rate limit dei provider di geocoding.

  Sono tre proprietà, e nessuna delle tre si vede leggendo il codice: dipendono da come le promesse
  si incatenano, che è esattamente il posto dove si sbaglia in silenzio. Un errore qui non rompe
  niente in modo visibile — fa solo andare la geocodifica al doppio del tempo, oppure fa banare
  l'IP. Entrambe cose che si scoprono dopo, sui dati veri.

  Le pause nei test sono di pochi decine di millisecondi: quello che si verifica è il RAPPORTO fra
  i tempi, non il secondo di produzione.
*/

const PAUSA = 40;
const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Coda distinta per ogni test: sono stato di modulo, e due test non devono incrociarsi. */
let contatore = 0;
const nuovaCoda = () => `test-${(contatore += 1)}`;

describe('inCoda', () => {
  // Il vincolo vero di Nominatim: non più di una richiesta al secondo. Due chiamate allo stesso
  // provider devono restare distanziate, sempre.
  it('distanzia due chiamate allo stesso provider', async () => {
    const coda = nuovaCoda();
    const inizi: number[] = [];
    const t0 = Date.now();
    const segna = async () => { inizi.push(Date.now() - t0); };

    await Promise.all([inCoda(coda, segna, PAUSA), inCoda(coda, segna, PAUSA)]);

    expect(inizi).toHaveLength(2);
    expect(inizi[1] - inizi[0]).toBeGreaterThanOrEqual(PAUSA - 5);
  });

  /*
    Il motivo per cui questa modifica esiste.

    Il limite di Nominatim è di Nominatim. Photon è un altro servizio su un altro host: farlo
    aspettare dietro Nominatim non rispetta nessuna policy, aggiunge solo attesa. Sul registro
    ACEA la cascata arriva spesso fino a Photon, quindi era attesa pagata su quasi ogni indirizzo.
  */
  it('non fa aspettare un provider dietro l’altro', async () => {
    const a = nuovaCoda();
    const b = nuovaCoda();
    const t0 = Date.now();
    let quandoB = -1;

    await inCoda(a, async () => {});
    await inCoda(b, async () => { quandoB = Date.now() - t0; }, PAUSA);

    // Se le code fossero una sola, la seconda avrebbe aspettato la pausa della prima.
    expect(quandoB).toBeGreaterThanOrEqual(0);
    expect(quandoB).toBeLessThan(PAUSA);
  });

  /*
    La pausa protegge la chiamata SUCCESSIVA, quindi la paga lei — non chi ha già finito.

    Prima la promessa restituita si risolveva dopo l'attesa: chi aspettava un indirizzo pagava
    anche il secondo che serviva a proteggere una chiamata che magari non ci sarebbe mai stata.
    Sull'ultimo passo della cascata era attesa buttata, una per indirizzo.
  */
  it('restituisce il risultato senza far pagare al chiamante la pausa', async () => {
    const coda = nuovaCoda();
    const t0 = Date.now();

    const valore = await inCoda(coda, async () => 'fatto', PAUSA);

    expect(valore).toBe('fatto');
    expect(Date.now() - t0).toBeLessThan(PAUSA);
  });

  /*
    Una chiamata andata male non deve portarsi dietro tutte le altre.

    È la trappola classica della coda a promesse: se il rifiuto viene incatenato senza un ramo
    d'errore, ogni richiesta successiva a quel provider fallisce con l'errore della PRIMA — e nei
    log si vede un provider «rotto» che invece sta benissimo.
  */
  it('una chiamata fallita non pianta la coda', async () => {
    const coda = nuovaCoda();

    await expect(inCoda(coda, async () => { throw new Error('rete giù'); }, PAUSA)).rejects.toThrow('rete giù');
    await expect(inCoda(coda, async () => 'la successiva passa', PAUSA)).resolves.toBe('la successiva passa');
  });

  // E deve comunque rispettare l'attesa: un provider che risponde con un errore è spesso un
  // provider sotto pressione, ed è il momento peggiore per ripartire subito.
  it('anche dopo un errore la pausa viene rispettata', async () => {
    const coda = nuovaCoda();
    const t0 = Date.now();

    await inCoda(coda, async () => { throw new Error('ko'); }, PAUSA).catch(() => {});
    await inCoda(coda, async () => {}, PAUSA);

    expect(Date.now() - t0).toBeGreaterThanOrEqual(PAUSA - 5);
  });

  // L'ordine di arrivo è l'ordine di esecuzione: la cascata ha senso solo se il passo successivo
  // parte dopo il precedente.
  it('rispetta l’ordine di accodamento', async () => {
    const coda = nuovaCoda();
    const ordine: number[] = [];

    await Promise.all([1, 2, 3].map((n) =>
      inCoda(coda, async () => { await attendi(1); ordine.push(n); }, 1),
    ));

    expect(ordine).toEqual([1, 2, 3]);
  });
});
