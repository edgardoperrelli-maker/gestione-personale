// Filtri condivisi tra la lista "Ordine presente" (GET /aperti) e il suo export Excel: stessa
// logica di ricerca, così i due non divergono. PURA a parte l'applicazione sul query builder.

/** Stati "aperti": interventi non ancora esitati (né completati né annullati). */
export const OPEN_STATES = ['da_assegnare', 'assegnato', 'in_viaggio', 'sul_posto', 'in_esecuzione'];

/** Colonne selezionate per lista/export. */
export const APERTI_COLS =
  'id, committente, odl, pdr, nominativo, indirizzo, comune, cap, matricola_contatore, intervento_tipo, gruppo_attivita, data, staff_id, territorio_id, fascia_oraria';

export type FiltriAperti = {
  committente: string; gruppo: string; attivita: string; operatore: string;
  dal: string; al: string; odl: string; pdr: string; via: string;
};

const g = (p: URLSearchParams, k: string) => (p.get(k) ?? '').trim();

export function parseFiltriAperti(p: URLSearchParams): FiltriAperti {
  return {
    committente: g(p, 'committente'), gruppo: g(p, 'gruppo'), attivita: g(p, 'attivita'),
    operatore: g(p, 'operatore'), dal: g(p, 'dal'), al: g(p, 'al'),
    odl: g(p, 'odl'), pdr: g(p, 'pdr'), via: g(p, 'via'),
  };
}

/** true se è impostato almeno un filtro (la ricerca/export parte solo su richiesta esplicita). */
export function haFiltro(f: FiltriAperti): boolean {
  return Object.values(f).some(Boolean);
}

const like = (v: string) => `%${v.replace(/[%_]/g, (m) => `\\${m}`)}%`;

/**
 * Sottoinsieme dei metodi filtro del query builder Supabase, self-referential (niente generic
 * ricorsivo → evita "Type instantiation is excessively deep"). Il chiamante fa il cast da/verso il
 * builder reale (i metodi esistono a runtime con queste firme).
 */
export interface QueryFiltrabile {
  in(column: string, values: readonly string[]): QueryFiltrabile;
  or(filters: string): QueryFiltrabile;
  eq(column: string, value: string): QueryFiltrabile;
  ilike(column: string, pattern: string): QueryFiltrabile;
  gte(column: string, value: string): QueryFiltrabile;
  lte(column: string, value: string): QueryFiltrabile;
}

/**
 * Applica gli stati aperti, l'esclusione dei CONTENITORI task-via (gruppo BONIFICHE EXTRA: non hanno
 * esito proprio) e i filtri di ricerca impostati. Ordinamento/limite li mette il chiamante.
 */
export function applicaFiltriAperti(query: QueryFiltrabile, f: FiltriAperti): QueryFiltrabile {
  let q = query
    .in('stato', OPEN_STATES)
    // gruppo null mantenuto: `neq` da solo escluderebbe anche i null.
    .or('gruppo_attivita.is.null,gruppo_attivita.neq."BONIFICHE EXTRA"');
  if (f.committente) q = q.eq('committente', f.committente);
  if (f.gruppo) q = q.eq('gruppo_attivita', f.gruppo);
  if (f.attivita) q = q.ilike('intervento_tipo', f.attivita); // ilike senza wildcard = uguaglianza case-insensitive
  if (f.operatore) q = q.eq('staff_id', f.operatore);
  if (f.dal) q = q.gte('data', f.dal);
  if (f.al) q = q.lte('data', f.al);
  if (f.odl) q = q.ilike('odl', like(f.odl));
  if (f.pdr) q = q.ilike('pdr', like(f.pdr));
  if (f.via) q = q.ilike('indirizzo', like(f.via));
  return q;
}
