import type { RegolaMappa } from '@/lib/agente/decisione';
import type { AgenteFileColonneRow } from '@/lib/agente/uiTypes';

export type ColonnaStato = 'presente' | 'nuova' | 'sparita';
export type ColonnaVista = { nome: string; stato: ColonnaStato };

/** Colonne di un file con stato (nuova/presente/sparita) per l'evidenziazione. */
export function columnsDaFile(row: AgenteFileColonneRow): ColonnaVista[] {
  const nuove = new Set(row.colonne_nuove);
  const presenti: ColonnaVista[] = row.colonne.map((nome) => ({
    nome,
    stato: nuove.has(nome) ? 'nuova' : 'presente',
  }));
  const sparite: ColonnaVista[] = row.colonne_sparite
    .filter((nome) => !row.colonne.includes(nome))
    .map((nome) => ({ nome, stato: 'sparita' }));
  return [...presenti, ...sparite];
}

/** Insieme globale ordinato (asc) e deduplicato di tutte le colonne attualmente rilevate. */
export function colonneRilevate(files: AgenteFileColonneRow[]): string[] {
  const set = new Set<string>();
  for (const f of files) for (const c of f.colonne) set.add(c);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Aggiorna immutabilmente la regola del `campo` indicato (lascia le altre per riferimento). */
export function uniscoMappaturaColonna(
  mappatura: RegolaMappa[],
  campo: string,
  patch: Partial<RegolaMappa>,
): RegolaMappa[] {
  return mappatura.map((r) => (r.campo === campo ? { ...r, ...patch } : r));
}
