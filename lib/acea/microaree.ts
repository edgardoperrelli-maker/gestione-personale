// lib/acea/microaree.ts
// PURA: da coordinate a «gruppo», il numero che dice quali misuratori conviene fare nello stesso giro.
//
// Il CAP dice la zona postale, che a Roma può essere larga chilometri; il gruppo dice la vicinanza
// vera, perché nasce dalle coordinate. È il numero che si legge in tabella per capire, a colpo
// d'occhio, quali righe stanno insieme.
//
// Due scelte che vale la pena dichiarare, perché sono quelle che rendono il numero USABILE:
//
// 1. **Griglia, non clustering.** Un algoritmo a distanza (k-means, DBSCAN) darebbe gruppi più
//    belli, ma i suoi confini si spostano appena il registro cambia: l'import di domani
//    rinumererebbe zone che nessuno ha toccato, e un numero che cambia da solo non si può usare
//    per dirsi «fai il 12». La griglia è deterministica: la stessa coordinata cade nella stessa
//    cella oggi e fra sei mesi.
//
// 2. **Il gruppo non attraversa mai un comune.** Due punti a un chilometro ma in comuni diversi
//    sono due giri diversi — cambiano referente, permessi e a volte il territorio assegnato.
//    Il comune entra quindi nella chiave, prima della cella.
//
// Il prezzo della griglia è il confine: due misuratori vicinissimi ma ai lati di una linea finiscono
// in gruppi diversi. È un difetto noto e accettato — l'alternativa è l'instabilità, che costa di più.

/** Coordinata geografica. */
export type Coordinata = { lat: number; lng: number };

/**
 * Riquadro del Lazio, con un margine.
 *
 * Serve a scartare le geocodifiche sbagliate, che sono la patologia tipica di questi provider: su
 * un indirizzo ambiguo Nominatim risponde volentieri con l'omonimo in un'altra regione — «VIA
 * ROMA 1» esiste ovunque — e un punto a Milano non produce un gruppo sbagliato, ne produce uno
 * INVENTATO, che manderebbe una squadra a fare un giro che non esiste.
 *
 * Generoso di proposito: la commessa è Roma e provincia, ma il riquadro copre tutto il Lazio, così
 * un comune di confine non viene scartato per pochi chilometri.
 */
export const RIQUADRO_LAZIO = {
  latMin: 40.70, latMax: 42.92,
  lngMin: 11.35, lngMax: 14.10,
} as const;

/** `true` se il punto cade nel riquadro regionale, cioè se la geocodifica è credibile. */
export function dentroLazio(c: Coordinata): boolean {
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return false;
  return (
    c.lat >= RIQUADRO_LAZIO.latMin && c.lat <= RIQUADRO_LAZIO.latMax
    && c.lng >= RIQUADRO_LAZIO.lngMin && c.lng <= RIQUADRO_LAZIO.lngMax
  );
}

/**
 * Lato della cella, in gradi. ~2 km per lato alla latitudine di Roma.
 *
 * Due gradi di longitudine valgono meno di due di latitudine a queste latitudini (un grado di
 * longitudine a 42° è ~82,6 km contro i ~111 di uno di latitudine): i due lati sono diversi
 * proprio per ottenere una cella quadrata sul terreno invece che sulla carta.
 *
 * 2 km è la scala di un giro a piedi fra un misuratore e l'altro in città. Più stretto frammenta i
 * gruppi, più largo mette insieme punti che richiedono comunque il furgone.
 */
export const LATO_LAT = 0.018;
export const LATO_LNG = 0.024;

/** Indici interi della cella che contiene il punto. */
export function cella(c: Coordinata): { ix: number; iy: number } {
  return { ix: Math.floor(c.lng / LATO_LNG), iy: Math.floor(c.lat / LATO_LAT) };
}

export type PuntoOrdine = {
  /** Chiave della riga: la coppia, perché un ODL può avere più operazioni. */
  chiave: string;
  comune: string | null;
  coord: Coordinata | null;
};

/** Chiave di microarea: comune + cella. Il comune viene prima, e non si attraversa mai. */
function chiaveArea(p: PuntoOrdine): string | null {
  if (!p.coord || !dentroLazio(p.coord)) return null;
  const { ix, iy } = cella(p.coord);
  return `${(p.comune ?? '').toUpperCase()}|${iy}|${ix}`;
}

export type Gruppi = {
  /** Chiave riga → numero di gruppo. Le righe senza coordinata credibile non compaiono. */
  perRiga: Map<string, number>;
  /** Quante microaree sono uscite. */
  totale: number;
  /** Righe rimaste senza gruppo: mancano le coordinate, o cadono fuori dal Lazio. */
  senzaGruppo: number;
};

/**
 * Numera le microaree e assegna il numero a ogni riga.
 *
 * La numerazione segue l'ordine geografico (comune, poi da nord a sud, poi da ovest a est): due
 * gruppi vicini di numero sono vicini anche sul terreno, quindi l'elenco ordinato per gruppo si
 * legge come un giro invece che come una lista casuale.
 *
 * I numeri sono ricalcolati a ogni passaggio: non sono un'identità permanente della zona, sono
 * un'etichetta della fotografia corrente. Un'area nuova che compare in mezzo sposta di uno i numeri
 * successivi — ed è il motivo per cui il gruppo si dice sempre insieme al comune, mai da solo.
 */
export function assegnaGruppi(punti: readonly PuntoOrdine[]): Gruppi {
  const perArea = new Map<string, string[]>();
  let senzaGruppo = 0;

  for (const p of punti) {
    const k = chiaveArea(p);
    if (k === null) {
      senzaGruppo += 1;
      continue;
    }
    const righe = perArea.get(k);
    if (righe) righe.push(p.chiave);
    else perArea.set(k, [p.chiave]);
  }

  // Ordine geografico: comune, poi latitudine decrescente (nord → sud), poi longitudine crescente.
  const aree = [...perArea.keys()].sort((a, b) => {
    const [ca, ya, xa] = a.split('|');
    const [cb, yb, xb] = b.split('|');
    if (ca !== cb) return ca.localeCompare(cb, 'it');
    if (ya !== yb) return Number(yb) - Number(ya);
    return Number(xa) - Number(xb);
  });

  const perRiga = new Map<string, number>();
  aree.forEach((k, i) => {
    for (const riga of perArea.get(k) ?? []) perRiga.set(riga, i + 1);
  });

  return { perRiga, totale: aree.length, senzaGruppo };
}
