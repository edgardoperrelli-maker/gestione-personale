// PURA: la coda «da assegnare» e le righe del suo export.
//
// «Da assegnare» NON è uno stato: è una riga **approvata** che non ha ancora un
// `assegnato_committente_at`. I due assi sono separati di proposito — `stato` è la decisione
// interna dell'ufficio, l'assegnazione è un fatto sul sistema del committente. Tenendoli
// distinti, nessuno dei lettori di `stato` (registro, badge, guard, check-and-set atomico)
// deve imparare che un valore in più conta come «approvato».
import type { RigaRichiesta } from './types';

/**
 * Committenti la cui assegnazione sul portale si fa A MANO, e va quindi registrata.
 *
 * Non è un elenco di comodo: su ACEA (`lim_massive`) l'assegnazione degli ODL la faceva l'agente
 * automatico del Cruscotto — fermo dal 29/06, ritirato del tutto il 04/08/2026 — e Italgas non
 * ha un portale su cui assegnare. Metterli in questa coda significherebbe chiedere all'ufficio
 * di spuntare a mano righe che nessuno deve toccare.
 *
 * Senza questo filtro la coda nascerebbe con **2.521 righe** storiche già approvate (misurato
 * sul prod il 30/07: 2.140 lim_massive + 381 italgas), tutte con timestamp nullo perché la
 * colonna è nuova. Restringendo per committente la coda parte VUOTA — la commessa AcquaLatina
 * non ha ancora nessuna richiesta approvata — e non serve nessun backfill sui dati storici.
 */
export const COMMITTENTI_ASSEGNAZIONE_MANUALE = ['acqualatina'];

/** Riga approvata, di un committente ad assegnazione manuale, non ancora registrata. */
export function daAssegnare(
  r: Pick<RigaRichiesta, 'stato' | 'committente' | 'assegnato_committente_at'>,
): boolean {
  return r.stato === 'approvato'
    && COMMITTENTI_ASSEGNAZIONE_MANUALE.includes(r.committente)
    && !r.assegnato_committente_at;
}

export type RigaExport = {
  odl: string;
  operatore: string;
  matricola: string;
  indirizzo: string;
  comune: string;
  data: string;
  committente: string;
};

const t = (v: unknown): string => String(v ?? '').trim();

/** Anagrafica corrente della richiesta: `dati_correnti` è lo snapshot che l'ufficio può aver
 *  corretto in approvazione, quindi comanda su `dati_operatore`. */
function anagrafica(r: RigaRichiesta): Record<string, unknown> {
  const dati = (r.dati_correnti && Object.keys(r.dati_correnti).length > 0 ? r.dati_correnti : r.dati_operatore) ?? {};
  const a = (dati as { anagrafica?: unknown }).anagrafica;
  return a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
}

/**
 * Righe dell'export per il backoffice: cosa assegnare, e a chi.
 *
 * L'operatore destinatario è `staff_name` della richiesta — chi ha eseguito il cambio è chi
 * deve risultare assegnatario sul sistema del committente, altrimenti il lavoro non gli viene
 * riconosciuto. L'ODL viene dal master via autofill e vive nell'anagrafica.
 *
 * Ordine: per operatore e poi per ODL. Chi assegna lavora un operatore alla volta sul portale,
 * non un ordine alla volta: ordinare per data lo costringerebbe a saltare avanti e indietro.
 */
export function righeExportDaAssegnare(righe: RigaRichiesta[]): RigaExport[] {
  return (righe ?? [])
    .filter(daAssegnare)
    .map((r) => {
      const a = anagrafica(r);
      return {
        odl: t(a.odl),
        operatore: t(r.staff_name) || t(r.staff_id),
        matricola: t(a.matricola),
        indirizzo: t(a.via),
        comune: t(a.comune),
        data: t(r.data),
        committente: t(r.committente),
      };
    })
    .sort((x, y) =>
      x.operatore.localeCompare(y.operatore, 'it', { sensitivity: 'base' }) ||
      x.odl.localeCompare(y.odl, 'it', { numeric: true }));
}
