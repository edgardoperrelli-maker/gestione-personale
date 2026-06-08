// utils/mappa/cercaInterventi.ts
// Ricerca di un intervento per ODL o indirizzo tra TUTTI gli operatori della distribuzione,
// usata dalla barra di ricerca del pannello mappa per raggiungere e poi spostare/annullare.

export type OperatoreRicerca = {
  op?: string | null;
  tasks: Array<{ id: string; odl?: string | null; indirizzo?: string | null; citta?: string | null }>;
};

export type RisultatoRicerca = {
  taskId: string;
  opIdx: number;
  opName: string;
  odl: string;
  indirizzo: string;
};

/**
 * Cerca gli interventi il cui ODL o indirizzo contiene `query` (case-insensitive),
 * scorrendo tutti gli operatori. Query vuota → nessun risultato.
 * I risultati conservano `opIdx` per poter aprire il tab giusto ed evidenziare l'intervento.
 */
export function cercaInterventi(operatori: OperatoreRicerca[], query: string): RisultatoRicerca[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: RisultatoRicerca[] = [];
  operatori.forEach((op, opIdx) => {
    const opName = (op.op ?? '').trim() || `Operatore ${opIdx + 1}`;
    for (const t of op.tasks) {
      const odl = String(t.odl ?? '');
      const indirizzo = [t.indirizzo, t.citta].filter(Boolean).join(', ');
      const haystack = `${odl} ${indirizzo}`.toLowerCase();
      if (haystack.includes(q)) {
        out.push({ taskId: t.id, opIdx, opName, odl, indirizzo });
      }
    }
  });
  return out;
}
