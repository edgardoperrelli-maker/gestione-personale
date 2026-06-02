import type { StatoIntervento } from './statoInterventi';

export type AssegnaPatch = {
  staff_id: string | null;
  stato: StatoIntervento; // 'assegnato' | 'da_assegnare'
  assegnatoAt: 'set' | 'keep' | 'clear';
  azzeraAvvio: boolean; // azzera iniziato_at/chiuso_at (reset da stato avviato)
};
export type EsitoPianificazione = { ok: true; patch: AssegnaPatch } | { ok: false; errore: string };

const TERMINALI: ReadonlySet<StatoIntervento> = new Set(['completato', 'annullato']);
const AVVIATI: ReadonlySet<StatoIntervento> = new Set(['in_viaggio', 'sul_posto', 'in_esecuzione']);

/**
 * Decide la patch per assegnare/riassegnare/disassegnare un intervento.
 * Riassegnazione permissiva su tutti gli stati non terminali (gli avviati
 * tornano ad 'assegnato'); `completato`/`annullato` rifiutati. Puro/testabile.
 */
export function pianificaAssegnazione(statoCorrente: StatoIntervento, staffId: string | null): EsitoPianificazione {
  if (TERMINALI.has(statoCorrente)) {
    return { ok: false, errore: `Intervento ${statoCorrente}: non riassegnabile` };
  }
  if (staffId) {
    return {
      ok: true,
      patch: {
        staff_id: staffId,
        stato: 'assegnato',
        assegnatoAt: statoCorrente === 'da_assegnare' ? 'set' : 'keep',
        azzeraAvvio: AVVIATI.has(statoCorrente),
      },
    };
  }
  if (statoCorrente === 'da_assegnare') {
    return { ok: true, patch: { staff_id: null, stato: 'da_assegnare', assegnatoAt: 'keep', azzeraAvvio: false } };
  }
  return {
    ok: true,
    patch: { staff_id: null, stato: 'da_assegnare', assegnatoAt: 'clear', azzeraAvvio: AVVIATI.has(statoCorrente) },
  };
}
