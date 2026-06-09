/** Filtri di pulizia della tabella di riferimento misuratori. */
export type FiltriRef = {
  indirizzo: string;
  civico: string;
  comune: string;
  import_id: string;
  vuoto: boolean; // true se nessun filtro e' valorizzato (vieta la DELETE di massa)
};

export function parseFiltriRef(sp: URLSearchParams): FiltriRef {
  const g = (k: string) => (sp.get(k) ?? '').trim();
  const indirizzo = g('indirizzo');
  const civico = g('civico');
  const comune = g('comune');
  const import_id = g('import_id');
  return { indirizzo, civico, comune, import_id, vuoto: !indirizzo && !civico && !comune && !import_id };
}
