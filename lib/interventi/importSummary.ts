/** Esito dell'import restituito da POST /api/interventi/import. */
export type ImportInterventiResult = {
  ok: true;
  batchId: string;
  committente: string;
  data: string;
  lotto: number | null;
  totaliRighe: number;
  inseriti: number;
  aggiornati: number;
};

/**
 * Riepilogo leggibile dei conteggi di import.
 * Es. { totaliRighe: 15, inseriti: 12, aggiornati: 3 } → "12 inseriti, 3 aggiornati su 15 righe".
 */
export function formatImportSummary(
  r: Pick<ImportInterventiResult, 'totaliRighe' | 'inseriti' | 'aggiornati'>,
): string {
  const inseriti = r.inseriti === 1 ? '1 inserito' : `${r.inseriti} inseriti`;
  const aggiornati = r.aggiornati === 1 ? '1 aggiornato' : `${r.aggiornati} aggiornati`;
  const righe = r.totaliRighe === 1 ? '1 riga' : `${r.totaliRighe} righe`;
  return `${inseriti}, ${aggiornati} su ${righe}`;
}
