// PURA: «che cosa ACEA ha consuntivato», dalle due fonti che lo sanno.
//
// Il gate del SAL è sempre stato «COMPLETATO sul portale», letto da `acea_portale_snapshot`. Quella
// tabella però la scriveva l'agente Playwright, RITIRATO il 04/08/2026: da allora ha solo lettori ed
// è ferma al 29/07. Il pre-SAL, che su quel gate si regge, ha quindi smesso di vedere tutto ciò che
// ACEA ha chiuso dopo — al 06/08 erano 265 ordini pagabili (76 di luglio, 189 di agosto), lavoro
// nostro consuntivato che semplicemente non compariva nei conti.
//
// La seconda fonte è il REGISTRO del Cruscotto (`acea_ordini`), che l'import aggiorna tutti i
// giorni. Non è un ripiego: sui 5.828 ordini presenti in entrambe le fonti il registro è risultato
// AVANTI 320 volte e INDIETRO mai — chiude ciò che il portale non ha ancora fotografato, e non
// contraddice mai una chiusura già vista. Per questo l'unione è sicura: aggiunge, non riscrive.
//
// Il portale resta la fonte PRIMARIA della causale (è la stessa che finisce nel SAL ufficiale); il
// registro parla solo per gli ordini che il portale non conosce ancora.

/** Consuntivazione di un ordine: la causale con cui ACEA lo ha chiuso, e chi ce lo dice. */
export interface ConsuntivazioneOdl {
  /** Causa scostamento SAP: `E…` = prestazione pagata, altro = a nostro carico. */
  causa: string | null;
  fonte: 'portale' | 'registro';
}

export interface RigaPortaleConsuntivo {
  odl: string;
  statoNorm: string | null;
  causa: string | null;
}

export interface RigaRegistroConsuntivo {
  odl: string;
  /** Stato SAP dell'ULTIMO tentativo: `COMP` = ordine chiuso. */
  stato: string | null;
  causale: string | null;
}

const COMPLETATO_PORTALE = 'COMPLETATO';
const COMPLETATO_REGISTRO = 'COMP';

/**
 * Gli ODL che ACEA ha consuntivato, dall'unione delle due fonti.
 *
 * `escludi` toglie gli ordini che la vista non deve vedere (il gas riclassificato a italgas):
 * si applica una volta sola qui, invece che in ogni giro a valle.
 */
export function consuntivazioneAcea(args: {
  portale: Iterable<RigaPortaleConsuntivo>;
  registro: Iterable<RigaRegistroConsuntivo>;
  escludi?: (odl: string) => boolean;
}): Map<string, ConsuntivazioneOdl> {
  const fuori = args.escludi ?? (() => false);
  const out = new Map<string, ConsuntivazioneOdl>();

  for (const p of args.portale) {
    const odl = (p.odl ?? '').trim();
    if (!odl || fuori(odl) || out.has(odl)) continue;
    if ((p.statoNorm ?? '').trim() !== COMPLETATO_PORTALE) continue;
    out.set(odl, { causa: p.causa, fonte: 'portale' });
  }

  for (const r of args.registro) {
    const odl = (r.odl ?? '').trim();
    // `out.has` non è solo deduplica: è la precedenza del portale sulla causale.
    if (!odl || fuori(odl) || out.has(odl)) continue;
    if ((r.stato ?? '').trim().toUpperCase() !== COMPLETATO_REGISTRO) continue;
    out.set(odl, { causa: r.causale, fonte: 'registro' });
  }

  return out;
}
