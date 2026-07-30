// lib/acea/righeAppunti.ts
// PURA: le RIGHE selezionate come cittadine degli appunti — si copiano e ci si incolla sopra,
// senza passare dalla barra di assegnazione.
//
// Il registro aveva due selezioni scollegate: le spunte a sinistra (che servivano solo alla barra
// «Pianifica») e il cursore di cella (che serviva a copiare). Chi spuntava trenta righe e premeva
// Ctrl+C copiava la cella sotto al cursore, non le trenta righe — e per assegnare doveva per forza
// aprire la barra. Qui c'è l'altra metà: dalle spunte si copia, e sulle spunte si incolla.
//
// Niente React e niente DOM: le decisioni difficili — un blocco più corto della selezione, una
// nota che contiene un a capo, un incolla che sfonda il bordo destro — stanno dove si provano.

import type { Limiti, ScritturaCella } from './editingGriglia';

/**
 * Una cella TSV come la scrive Excel.
 *
 * Serve davvero: la colonna Note è testo libero fino a 500 caratteri, e una nota con un a capo
 * dentro spezzava la riga copiata in due — chi incollava in un foglio si ritrovava una riga in
 * più, disallineata da lì in giù, senza niente che lo segnalasse.
 */
export function citaSeServe(v: string): string {
  return /[\t\n\r"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Le righe indicate, in TSV, colonna per colonna nell'ordine in cui si vedono.
 *
 * Nessuna riga di intestazione: è il formato di Excel quando si copiano righe, ed è quello che
 * consente di reincollarle qui dentro senza che «Esecutore» venga preso per un nome.
 */
export function testoRighe(
  indici: readonly number[],
  colonne: readonly string[],
  valore: (riga: number, colonna: string) => string,
): string {
  return indici
    .map((r) => colonne.map((c) => citaSeServe(valore(r, c))).join('\t'))
    .join('\n');
}

export type EsitoIncollaRighe = {
  scritture: ScritturaCella[];
  /** Righe del blocco rimaste senza una riga spuntata dove finire: troncate, mai spostate altrove. */
  righeIgnorate: number;
  /** Colonne del blocco cadute oltre il bordo destro della tabella. */
  colonneIgnorate: number;
  /** Righe spuntate rimaste senza dati, perché il blocco era più corto della selezione. */
  righeNonCoperte: number;
};

const VUOTO: EsitoIncollaRighe = {
  scritture: [], righeIgnorate: 0, colonneIgnorate: 0, righeNonCoperte: 0,
};

/**
 * Dove finisce un blocco incollato quando il bersaglio sono le RIGHE SPUNTATE.
 *
 * Le righe spuntate possono non essere contigue — si spuntano gli ordini di una zona scorrendo la
 * tabella — quindi non si può ragionare per rettangolo come fa `calcolaIncolla`: si scrive sulle
 * righe indicate, nell'ordine in cui compaiono in tabella, e su nessun'altra.
 *
 * Tre comportamenti, gli stessi che si hanno in Excel su una selezione:
 *  - blocco di UNA cella → lo stesso valore su tutte le righe spuntate (è il gesto con cui si dà
 *    lo stesso esecutore a quaranta ordini, senza aprire la barra di assegnazione);
 *  - blocco di UNA riga → quella riga di valori ripetuta su tutte le spuntate (esecutore e data
 *    insieme, in un colpo solo);
 *  - blocco di PIÙ righe → riga per riga, in ordine; ciò che avanza da una parte o dall'altra
 *    viene contato e riportato, mai scritto altrove.
 */
export function incollaSuRighe(
  blocco: string[][],
  righeSpuntate: readonly number[],
  colonnaDa: number,
  limiti: Limiti,
): EsitoIncollaRighe {
  if (blocco.length === 0 || righeSpuntate.length === 0) return VUOTO;
  if (limiti.righe === 0 || limiti.colonne === 0) return VUOTO;

  const bersagli = righeSpuntate.filter((r) => r >= 0 && r < limiti.righe);
  if (bersagli.length === 0) return VUOTO;

  // Una riga sola nel blocco (una cella o una fila di celle) si RIPETE su tutte le spuntate:
  // è il caso che rende inutile la barra di assegnazione, e va tenuto separato dal resto.
  const ripete = blocco.length === 1;
  const scritture: ScritturaCella[] = [];
  let colonneIgnorate = 0;

  const scriviRiga = (rigaTabella: number, valori: readonly string[], contaColonne: boolean) => {
    for (let c = 0; c < valori.length; c++) {
      const colonna = colonnaDa + c;
      if (colonna >= limiti.colonne) {
        if (contaColonne) colonneIgnorate++;
        continue;
      }
      scritture.push({ riga: rigaTabella, colonna, valore: valori[c] });
    }
  };

  if (ripete) {
    bersagli.forEach((riga, i) => scriviRiga(riga, blocco[0], i === 0));
    return { scritture, righeIgnorate: 0, colonneIgnorate, righeNonCoperte: 0 };
  }

  const coppie = Math.min(blocco.length, bersagli.length);
  for (let i = 0; i < coppie; i++) scriviRiga(bersagli[i], blocco[i], i === 0);

  return {
    scritture,
    righeIgnorate: Math.max(0, blocco.length - bersagli.length),
    colonneIgnorate,
    righeNonCoperte: Math.max(0, bersagli.length - blocco.length),
  };
}
