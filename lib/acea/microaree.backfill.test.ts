import { describe, it, expect } from 'vitest';
import { assegnaGruppi, type PuntoOrdine } from './microaree';

/**
 * Il backfill delle coordinate ha assegnato i numeri di microarea con una query SQL, perché girava
 * da fuori l'applicazione (nessuna chiave di servizio, e i provider di geocoding irraggiungibili
 * dal container). Due implementazioni della stessa regola sono due occasioni di divergere.
 *
 * Questo test chiude la questione su dati VERI presi dal registro dopo il backfill: la funzione
 * TypeScript — quella che gira in produzione a ogni ricalcolo — deve produrre la stessa
 * PARTIZIONE dell'SQL. Non gli stessi numeri assoluti: quelli dipendono dall'intero registro, e qui
 * c'è un campione. Ma «queste righe stanno insieme e quelle no» deve coincidere esattamente,
 * perché è l'unica cosa che il numero promette.
 *
 * Se un domani la griglia cambia e questo test si rompe, il messaggio è: i gruppi già scritti in
 * banca dati non corrispondono più a quello che il codice calcola, e vanno rinumerati.
 */
const CAMPIONE: Array<{ odl: string; comune: string; lat: number; lng: number; microarea: number }> = [
  { odl: '912228084/0010', comune: 'ZAGAROLO', lat: 41.8211562, lng: 12.8343424, microarea: 242 },
  { odl: '912231214/0010', comune: 'ZAGAROLO', lat: 41.8229656, lng: 12.84282, microarea: 243 },
  { odl: '912245371/0010', comune: 'ZAGAROLO', lat: 41.8179889, lng: 12.8319808, microarea: 242 },
  { odl: '957383965/0210', comune: 'ROMA', lat: 41.9986602, lng: 12.4898067, microarea: 125 },
  { odl: '957311079/0190', comune: 'ROMA', lat: 41.8615053, lng: 12.6189977, microarea: 188 },
  { odl: '912229716/0010', comune: 'ZAGAROLO', lat: 41.8185774, lng: 12.8339004, microarea: 242 },
  { odl: '912350315/0010', comune: 'LABICO', lat: 41.787404, lng: 12.8818517, microarea: 72 },
  { odl: '957311377/0190', comune: 'ROMA', lat: 41.8990562, lng: 12.6987464, microarea: 176 },
  { odl: '912215441/0010', comune: 'ZAGAROLO', lat: 41.827786, lng: 12.8297739, microarea: 242 },
  { odl: '912355139/0010', comune: 'ZAGAROLO', lat: 41.8491978, lng: 12.7967888, microarea: 239 },
  { odl: '957311207/0210', comune: 'ROMA', lat: 41.911654, lng: 12.5208711, microarea: 164 },
  { odl: '912354911/0010', comune: 'ZAGAROLO', lat: 41.8302032, lng: 12.8375334, microarea: 242 },
  { odl: '912215580/0010', comune: 'ZAGAROLO', lat: 41.8212029, lng: 12.8316488, microarea: 242 },
  { odl: '912231816/0010', comune: 'ZAGAROLO', lat: 41.8376541, lng: 12.8092477, microarea: 239 },
  { odl: '957288932/0190', comune: 'ROMA', lat: 41.9107814, lng: 12.6733299, microarea: 169 },
  { odl: '957318699/0210', comune: 'ROMA', lat: 41.9126332, lng: 12.4958028, microarea: 163 },
  { odl: '912215377/0010', comune: 'ZAGAROLO', lat: 41.8455197, lng: 12.8260825, microarea: 240 },
  { odl: '912231021/0010', comune: 'ZAGAROLO', lat: 41.8553061, lng: 12.7875988, microarea: 236 },
  { odl: '912350549/0010', comune: 'LABICO', lat: 41.7863351, lng: 12.8830541, microarea: 72 },
  { odl: '912229686/0010', comune: 'ZAGAROLO', lat: 41.8208049, lng: 12.8291906, microarea: 242 },
  { odl: '912230747/0010', comune: 'ZAGAROLO', lat: 41.8302032, lng: 12.8375334, microarea: 242 },
  { odl: '912228612/0010', comune: 'ZAGAROLO', lat: 41.8553061, lng: 12.7875988, microarea: 236 },
  { odl: '912231493/0010', comune: 'ZAGAROLO', lat: 41.8281631, lng: 12.8315521, microarea: 242 },
  { odl: '912228200/0010', comune: 'ZAGAROLO', lat: 41.8222817, lng: 12.834821, microarea: 242 },
  { odl: '957311444/0130', comune: 'CAVE', lat: 41.8171624, lng: 12.9367219, microarea: 20 },
];

/** Chi sta con chi: l'insieme delle coppie che condividono un gruppo. */
function partizione(coppie: Array<{ odl: string; gruppo: number | string }>): Set<string> {
  const insieme = new Set<string>();
  for (const a of coppie) {
    for (const b of coppie) {
      if (a.odl < b.odl && a.gruppo === b.gruppo) insieme.add(`${a.odl}~${b.odl}`);
    }
  }
  return insieme;
}

describe('backfill SQL vs funzione TypeScript', () => {
  it('partizionano il campione allo stesso modo', () => {
    const punti: PuntoOrdine[] = CAMPIONE.map((r) => ({
      chiave: r.odl,
      comune: r.comune,
      coord: { lat: r.lat, lng: r.lng },
    }));
    const calcolati = assegnaGruppi(punti);

    const daTs = CAMPIONE.map((r) => ({ odl: r.odl, gruppo: calcolati.perRiga.get(r.odl)! }));
    const daSql = CAMPIONE.map((r) => ({ odl: r.odl, gruppo: r.microarea }));

    expect(partizione(daTs)).toEqual(partizione(daSql));
  });

  it('l’ordine dei numeri è lo stesso: comune, poi da nord a sud', () => {
    // La partizione dice «chi sta con chi»; questo dice che i gruppi si SUSSEGUONO uguale, cioè che
    // anche il criterio di numerazione dell'SQL coincide con quello della funzione.
    const punti: PuntoOrdine[] = CAMPIONE.map((r) => ({
      chiave: r.odl, comune: r.comune, coord: { lat: r.lat, lng: r.lng },
    }));
    const calcolati = assegnaGruppi(punti);

    const ordineTs = [...CAMPIONE]
      .sort((a, b) => calcolati.perRiga.get(a.odl)! - calcolati.perRiga.get(b.odl)! || a.odl.localeCompare(b.odl))
      .map((r) => r.microarea);
    const crescente = [...ordineTs].sort((a, b) => a - b);
    expect(ordineTs).toEqual(crescente);
  });

  it('ogni riga del campione ha ricevuto un gruppo', () => {
    // Nessun buco: una coordinata valida che non produce gruppo sarebbe un punto scartato per
    // sbaglio dal riquadro regionale.
    const punti: PuntoOrdine[] = CAMPIONE.map((r) => ({
      chiave: r.odl, comune: r.comune, coord: { lat: r.lat, lng: r.lng },
    }));
    expect(assegnaGruppi(punti).senzaGruppo).toBe(0);
  });
});
