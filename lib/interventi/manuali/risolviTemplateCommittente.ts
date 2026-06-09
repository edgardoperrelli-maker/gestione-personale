// PURA: dato il committente e la lista template, ritorna l'id del template da usare.
// Priorità: template attivo con committente esatto → template attivo is_default → null.
import type { CommittenteManuale } from './types';

export type TemplateRow = {
  id: string;
  committente: string | null;
  is_default: boolean;
  active: boolean;
  solo_manuale?: boolean | null;
  foto_id_priority?: string[] | null;
};

export function risolviTemplateCommittente(
  committente: CommittenteManuale,
  templates: TemplateRow[],
): string | null {
  const attivi = templates.filter((t) => t.active);
  const esatto = attivi.find((t) => t.committente === committente);
  if (esatto) return esatto.id;
  const def = attivi.find((t) => t.is_default);
  return def ? def.id : null;
}
