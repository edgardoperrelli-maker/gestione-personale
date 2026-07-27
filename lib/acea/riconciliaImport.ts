// lib/acea/riconciliaImport.ts
// PURA: dal contenuto del file e dallo stato del registro, il piano di scrittura dell'import.
//
// Le regole (decisione 10 dello studio di fattibilità):
//   riga assente dal registro   → INSERISCI
//   riga con lo stesso hash     → SALTA (nemmeno `aggiornato_il`: "modificato" deve voler dire
//                                 davvero modificato, altrimenti il change-log è illeggibile)
//   riga con hash diverso       → AGGIORNA + registra i campi cambiati
//   riga in stato ANNL          → ELIMINA dal registro (e non inserirla mai)
//   riga in registro, assente dal file → NON TOCCARE
//
// Quest'ultima è la protezione più importante: l'export dipende dal filtro "Data pubblicazione ≥"
// impostato a mano nel Cruscotto. Se la cancellazione dipendesse dall'assenza, un filtro sbagliato
// raderebbe al suolo il registro. La cancellazione dipende dallo STATO SCRITTO NEL FILE, mai
// dall'assenza.

import { CAMPI_HASH } from './rigaHash';
import { isAnnullato } from './statiOrdine';
import type { RigaOrdineAcea } from './tipi';

export type ChiaveOrdine = { odl: string; numero_operazione: string };

export type CampoCambiato = {
  campo: string;
  prima: string | null;
  dopo: string | null;
};

export type RigaModificata = {
  riga: RigaOrdineAcea;
  cambi: CampoCambiato[];
};

/** Un ordine annullato da ACEA su cui però avevamo già pianificato un intervento. */
export type AnnullatoPianificato = ChiaveOrdine & {
  data: string | null;
  operatore: string | null;
};

export type PianoImport = {
  nuove: RigaOrdineAcea[];
  modificate: RigaModificata[];
  /** Quante righe del file erano identiche al registro (nessuna scrittura). */
  invariate: number;
  daEliminare: ChiaveOrdine[];
  /** Annullati che erano pianificati: da riportare nel riepilogo, non da cancellare in silenzio. */
  annullatiPianificati: AnnullatoPianificato[];
  /** Righe presenti nel registro ma non nel file: lasciate intatte, solo contate. */
  nonCoperte: number;
};

export type ArgomentiRiconcilia = {
  dalFile: readonly RigaOrdineAcea[];
  esistenti: readonly RigaOrdineAcea[];
  /** Interventi già pianificati, per chiave ordine: serve solo a segnalare gli annullati. */
  pianificati?: readonly AnnullatoPianificato[];
};

/** Chiave composta: la coppia, non l'ODL (un ordine può avere più operazioni fatturate). */
export function chiaveOrdine(r: ChiaveOrdine): string {
  return `${r.odl}|${r.numero_operazione}`;
}

/** Rappresentazione confrontabile di un valore di campo. */
function valore(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

/** Campi che risultano diversi fra la riga in registro e quella nel file. */
function diff(prima: RigaOrdineAcea, dopo: RigaOrdineAcea): CampoCambiato[] {
  const cambi: CampoCambiato[] = [];
  for (const campo of CAMPI_HASH) {
    const a = valore(prima[campo]);
    const b = valore(dopo[campo]);
    if (a !== b) cambi.push({ campo, prima: a, dopo: b });
  }
  return cambi;
}

/** Costruisce il piano di scrittura. Non tocca nulla: decide soltanto. */
export function riconciliaImport({
  dalFile,
  esistenti,
  pianificati = [],
}: ArgomentiRiconcilia): PianoImport {
  const inRegistro = new Map<string, RigaOrdineAcea>();
  for (const r of esistenti) inRegistro.set(chiaveOrdine(r), r);

  const pianificatiPerChiave = new Map<string, AnnullatoPianificato>();
  for (const p of pianificati) pianificatiPerChiave.set(chiaveOrdine(p), p);

  const nuove: RigaOrdineAcea[] = [];
  const modificate: RigaModificata[] = [];
  const daEliminare: ChiaveOrdine[] = [];
  const annullatiPianificati: AnnullatoPianificato[] = [];
  let invariate = 0;

  const vistiNelFile = new Set<string>();

  for (const riga of dalFile) {
    const k = chiaveOrdine(riga);
    vistiNelFile.add(k);
    const esistente = inRegistro.get(k);

    if (isAnnullato(riga.stato)) {
      // Non entra mai nel registro. Se c'era, esce — segnalando il caso in cui c'era lavoro sopra.
      if (esistente) {
        daEliminare.push({ odl: riga.odl, numero_operazione: riga.numero_operazione });
        const pianificato = pianificatiPerChiave.get(k);
        if (pianificato) annullatiPianificati.push(pianificato);
      }
      continue;
    }

    if (!esistente) {
      nuove.push(riga);
      continue;
    }
    if (esistente.riga_hash === riga.riga_hash) {
      invariate++;
      continue;
    }
    modificate.push({ riga, cambi: diff(esistente, riga) });
  }

  // Presenti in registro e assenti dal file: intatte. Il file potrebbe semplicemente essere stato
  // esportato con una finestra più stretta.
  let nonCoperte = 0;
  for (const k of inRegistro.keys()) if (!vistiNelFile.has(k)) nonCoperte++;

  return { nuove, modificate, invariate, daEliminare, annullatiPianificati, nonCoperte };
}
