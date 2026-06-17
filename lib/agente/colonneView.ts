import type { RegolaMappa } from '@/lib/agente/decisione';
import { CAMPI_MAPPABILI } from '@/lib/agente/decisione';
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

/**
 * Aggiorna (o aggiunge) immutabilmente la regola del `campo` indicato.
 * Se il campo non è presente in `mappatura`, viene aggiunto in fondo.
 */
export function uniscoMappaturaColonna(
  mappatura: RegolaMappa[],
  campo: string,
  patch: Partial<RegolaMappa>,
): RegolaMappa[] {
  const found = mappatura.some((r) => r.campo === campo);
  if (found) {
    return mappatura.map((r) => (r.campo === campo ? { ...r, ...patch } : r));
  }
  // Upsert: campo non ancora in mappatura → aggiungilo con il patch applicato
  const defaultRule: RegolaMappa =
    campo === 'marcatore'
      ? { campo, colonna: '', auto: true, abilitato: false }
      : { campo, colonna: '', abilitato: false };
  return [...mappatura, { ...defaultRule, ...patch }];
}

/**
 * Restituisce una riga per ogni campo in `CAMPI_MAPPABILI`, nell'ordine canonico.
 * Usa la regola esistente se presente, altrimenti una regola di default disabilitata.
 * Per `marcatore` il default ha `auto: true`.
 */
export function mappaturaCompleta(mappatura: RegolaMappa[]): RegolaMappa[] {
  const byField = new Map(mappatura.map((r) => [r.campo, r]));
  return (CAMPI_MAPPABILI as readonly string[]).map((campo) => {
    if (byField.has(campo)) return byField.get(campo)!;
    if (campo === 'marcatore') {
      return { campo, colonna: '', auto: true, abilitato: false };
    }
    return { campo, colonna: '', abilitato: false };
  });
}

/**
 * Restituisce i nomi di colonne che compaiono più di una volta nell'array.
 * Il confronto è case-insensitive.
 */
export function colonneDuplicate(colonne: string[]): string[] {
  const counts = new Map<string, { original: string; count: number }>();
  for (const c of colonne) {
    const key = c.toLowerCase();
    const entry = counts.get(key);
    if (entry) {
      entry.count++;
    } else {
      counts.set(key, { original: c, count: 1 });
    }
  }
  const duplicateKeys = new Set<string>();
  for (const [key, entry] of counts) {
    if (entry.count > 1) duplicateKeys.add(key);
  }
  // Return original-case names that are duplicates
  return colonne.filter((c) => duplicateKeys.has(c.toLowerCase()));
}
