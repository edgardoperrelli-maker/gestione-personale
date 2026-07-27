// lib/acea/collaudo.ts
// PURA: il confronto oggettivo fra il registro del modulo e le fonti che stiamo sostituendo.
//
// Prima di spegnere il master serve una prova, non un'impressione. Le fonti sono due e dicono cose
// diverse:
//
//   `acea_portale_snapshot`  — quello che l'agente legge dal Cruscotto. È la fonte più pulita
//                              (stato normalizzato, raccolto in automatico) ed è il confronto che
//                              conta: se il modulo e il portale non concordano, l'import sbaglia.
//   `acea_master_snapshot`   — quello che c'è scritto nei file. Sporco per costruzione: nella
//                              colonna stato convivono gli stati ACEA, i nostri, «DA CHIEDERE»,
//                              celle vuote e 43 righe con `[object Object]`. Si confronta per
//                              CAPIRE la differenza, non per validarla.
//
// Nessun troncamento silenzioso: gli scarti riportano il totale accanto agli esempi.

import { normOdl } from '@/lib/interventi/odlPositivi';

export type OdlStato = { odl: string; aperto: boolean };

/** Uno scarto: quanti sono davvero, e i primi per andarli a guardare. */
export type Scarto = { totale: number; esempi: string[] };

export type DifferenzaStato = { odl: string; modulo: 'aperto' | 'chiuso'; altra: 'aperto' | 'chiuso' };

export type Confronto = {
  moduloTotale: number;
  altraTotale: number;
  inEntrambi: number;
  /** ODL su cui le due fonti concordano anche sullo stato: è il numero che deve avvicinarsi a `inEntrambi`. */
  concordi: number;
  soloModulo: Scarto;
  soloAltra: Scarto;
  statoDiverso: { totale: number; esempi: DifferenzaStato[] };
};

const MAX_ESEMPI = 20;

const etichetta = (aperto: boolean): 'aperto' | 'chiuso' => (aperto ? 'aperto' : 'chiuso');

/**
 * Confronta due elenchi di ODL con il loro stato aperto/chiuso.
 *
 * Il confronto è per ODL, non per la coppia `(odl, numero_operazione)`: le fonti storiche non
 * portano il numero operazione, e i pochi ordini con due operazioni (3 su 5.290) non sarebbero
 * comunque distinguibili. Un ODL del modulo si considera aperto se lo è **almeno una** delle sue
 * operazioni — è lo stesso criterio con cui il backlog lo mostra.
 */
export function confrontaOdl(
  modulo: readonly OdlStato[],
  altra: readonly OdlStato[],
  opts: { maxEsempi?: number } = {},
): Confronto {
  const max = opts.maxEsempi ?? MAX_ESEMPI;

  const compatta = (righe: readonly OdlStato[]) => {
    const m = new Map<string, boolean>();
    for (const r of righe) {
      const k = normOdl(r.odl);
      if (!k) continue;
      m.set(k, (m.get(k) ?? false) || r.aperto);
    }
    return m;
  };
  const A = compatta(modulo);
  const B = compatta(altra);

  const soloModulo: string[] = [];
  let soloModuloTot = 0;
  const statoDiverso: DifferenzaStato[] = [];
  let statoDiversoTot = 0;
  let inEntrambi = 0;
  let concordi = 0;

  for (const [odl, apertoA] of A) {
    if (!B.has(odl)) {
      soloModuloTot++;
      if (soloModulo.length < max) soloModulo.push(odl);
      continue;
    }
    inEntrambi++;
    const apertoB = B.get(odl) as boolean;
    if (apertoA === apertoB) {
      concordi++;
    } else {
      statoDiversoTot++;
      if (statoDiverso.length < max) {
        statoDiverso.push({ odl, modulo: etichetta(apertoA), altra: etichetta(apertoB) });
      }
    }
  }

  const soloAltra: string[] = [];
  let soloAltraTot = 0;
  for (const odl of B.keys()) {
    if (A.has(odl)) continue;
    soloAltraTot++;
    if (soloAltra.length < max) soloAltra.push(odl);
  }

  return {
    moduloTotale: A.size,
    altraTotale: B.size,
    inEntrambi,
    concordi,
    soloModulo: { totale: soloModuloTot, esempi: soloModulo },
    soloAltra: { totale: soloAltraTot, esempi: soloAltra },
    statoDiverso: { totale: statoDiversoTot, esempi: statoDiverso },
  };
}

/**
 * Semaforo di un confronto.
 *
 * `verde` solo quando gli ODL condivisi concordano tutti sullo stato **e** nessun ODL manca dal
 * modulo. Un ODL presente nella fonte e assente dal modulo è il difetto grave: significa lavoro
 * che il modulo non vedrebbe. Il contrario — il modulo ne sa di più — è quasi sempre la finestra
 * dell'import che parte da più indietro, e infatti è quello che ci si aspetta al primo giro.
 */
export function semaforo(c: Confronto): 'verde' | 'giallo' | 'rosso' {
  if (c.soloAltra.totale > 0 || c.statoDiverso.totale > 0) return 'rosso';
  if (c.soloModulo.totale > 0) return 'giallo';
  return 'verde';
}
